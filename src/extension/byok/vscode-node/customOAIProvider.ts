/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Config, ConfigKey, CustomModelPickerModelConfig, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { EndpointEditToolName, isEndpointEditToolName, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { IStringDictionary } from '../../../util/vs/base/common/collections';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { byokKnownModelToAPIInfo, resolveModelInfo } from '../common/byokProvider';
import { OpenAIEndpoint } from '../node/openAIEndpoint';
import { AbstractOpenAICompatibleLMProvider, LanguageModelChatConfiguration, OpenAICompatibleLanguageModelChatInformation } from './abstractLanguageModelChatProvider';
import { IBYOKStorageService } from './byokStorageService';

export function resolveCustomOAIUrl(modelId: string, url: string): string {
	// The fully resolved url was already passed in
	if (hasExplicitApiPath(url)) {
		return url;
	}

	// Remove the trailing slash
	if (url.endsWith('/')) {
		url = url.slice(0, -1);
	}

	// Default to chat completions for base URLs
	const defaultApiPath = '/chat/completions';

	// Check if URL already contains any version pattern like /v1, /v2, etc
	const versionPattern = /\/v\d+$/;
	if (versionPattern.test(url)) {
		return `${url}${defaultApiPath}`;
	}

	// For standard OpenAI-compatible endpoints, just append the standard path
	return `${url}/v1${defaultApiPath}`;
}

export function hasExplicitApiPath(url: string): boolean {
	return url.includes('/responses') || url.includes('/chat/completions');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCustomModelPickerModelConfig(value: unknown): value is CustomModelPickerModelConfig {
	if (!isRecord(value)) {
		return false;
	}
	return typeof value.name === 'string'
		&& typeof value.url === 'string'
		&& typeof value.toolCalling === 'boolean'
		&& typeof value.vision === 'boolean'
		&& typeof value.maxInputTokens === 'number'
		&& typeof value.maxOutputTokens === 'number';
}

function getOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function getOptionalBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function getRequestHeaders(value: unknown): Record<string, string> | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function getEndpointEditTools(value: unknown): EndpointEditToolName[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const editTools = value.filter((item): item is EndpointEditToolName => typeof item === 'string' && isEndpointEditToolName(item));
	return editTools.length > 0 ? editTools : undefined;
}

export function getConfiguredCustomModelPickerModels(
	configurationService: IConfigurationService,
	logService: ILogService
): CustomOAIModelConfig[] {
	if (!configurationService.getConfig(ConfigKey.CustomModelPickerEnabled)) {
		return [];
	}
	const configuredModels: unknown = configurationService.getConfig(ConfigKey.CustomModelPickerModels);
	if (!isRecord(configuredModels)) {
		logService.warn('[custom-model-picker] models setting is not an object');
		return [];
	}
	const models: CustomOAIModelConfig[] = [];
	for (const [id, modelConfig] of Object.entries(configuredModels)) {
		if (!isCustomModelPickerModelConfig(modelConfig)) {
			logService.warn(`[custom-model-picker] skipping model '${id}' because the model config is invalid`);
			continue;
		}
		const name = modelConfig.name.trim();
		const url = modelConfig.url.trim();
		if (!name || !url) {
			logService.warn(`[custom-model-picker] skipping model '${id}' because name or url is empty`);
			continue;
		}
		models.push({
			id,
			name,
			url,
			apiKey: getOptionalString(modelConfig.apiKey),
			maxInputTokens: modelConfig.maxInputTokens,
			maxOutputTokens: modelConfig.maxOutputTokens,
			toolCalling: modelConfig.toolCalling,
			vision: modelConfig.vision,
			thinking: getOptionalBoolean(modelConfig.thinking),
			streaming: getOptionalBoolean(modelConfig.streaming),
			editTools: getEndpointEditTools(modelConfig.editTools),
			requestHeaders: getRequestHeaders(modelConfig.requestHeaders),
			zeroDataRetentionEnabled: getOptionalBoolean(modelConfig.zeroDataRetentionEnabled)
		});
	}
	return models;
}

export interface CustomOAIModelProviderConfig extends LanguageModelChatConfiguration {
	url?: string;
	models?: CustomOAIModelConfig[];
}

interface _CustomOAIModelConfig {
	name: string;
	url: string;
	apiKey?: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	toolCalling: boolean;
	vision: boolean;
	thinking?: boolean;
	streaming?: boolean;
	editTools?: EndpointEditToolName[];
	requestHeaders?: Record<string, string>;
	zeroDataRetentionEnabled?: boolean;
}

export interface CustomOAIModelConfig extends _CustomOAIModelConfig {
	id: string;
}

export abstract class AbstractCustomOAIBYOKModelProvider extends AbstractOpenAICompatibleLMProvider<CustomOAIModelProviderConfig> {

	constructor(
		id: string,
		name: string,
		byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@IVSCodeExtensionContext protected readonly _extensionContext: IVSCodeExtensionContext
	) {
		super(id, name, undefined, byokStorageService, fetcherService, logService, instantiationService, configurationService, expService);
	}

	protected async migrateConfig(configKey: Config<IStringDictionary<_CustomOAIModelConfig>>, providerName: string, providerGroupName: string): Promise<void> {
		// Check if migration has already been completed
		const migrationKey = `copilot-byok-migration-${providerName}-${configKey}`;
		const migrationCompleted = this._extensionContext.globalState.get<boolean>(migrationKey, false);
		if (migrationCompleted) {
			return;
		}

		const customOAIModelConfigsByApiKey: Map<string, Array<CustomOAIModelConfig & { requiresAPIKey?: boolean }>> = new Map();
		const customOAIModelProviderConfig = this._configurationService.getConfig<IStringDictionary<_CustomOAIModelConfig>>(configKey);
		for (const [modelId, modelConfig] of Object.entries(customOAIModelProviderConfig)) {
			const apiKey = await this._byokStorageService.getAPIKey(providerName, modelId) ?? '';
			const customOAIModelConfigs = customOAIModelConfigsByApiKey.get(apiKey) ?? [];
			customOAIModelConfigs.push({ ...modelConfig, id: modelId, requiresAPIKey: undefined });
			customOAIModelConfigsByApiKey.set(apiKey, customOAIModelConfigs);
		}
		if (customOAIModelConfigsByApiKey.size > 0) {
			for (const [apiKey, customOAIModelConfigs] of customOAIModelConfigsByApiKey.entries()) {
				await this.configureDefaultGroupIfExists(providerGroupName, { models: customOAIModelConfigs, apiKey: apiKey || undefined });
			}
			// Mark migration as completed instead of deleting the config
			await this._extensionContext.globalState.update(migrationKey, true);
		}
	}

	protected override async configureDefaultGroupWithApiKeyOnly(): Promise<string | undefined> {
		// No-op: Custom OAI models are configured separately via migration
		return;
	}

	protected override async getAllModels(silent: boolean, apiKey: string | undefined, configuration: CustomOAIModelProviderConfig | undefined): Promise<OpenAICompatibleLanguageModelChatInformation<CustomOAIModelProviderConfig>[]> {
		if (configuration?.url) {
			return super.getAllModels(silent, apiKey, configuration);
		}
		const models: OpenAICompatibleLanguageModelChatInformation<CustomOAIModelProviderConfig>[] = [];
		if (Array.isArray(configuration?.models)) {
			for (const modelConfig of configuration.models) {
				models.push({
					...byokKnownModelToAPIInfo(this._name, modelConfig.id, modelConfig),
					url: modelConfig.url
				});
			}
		}
		return models;
	}

	protected override async createOpenAIEndPoint(model: OpenAICompatibleLanguageModelChatInformation<CustomOAIModelProviderConfig>): Promise<OpenAIEndpoint> {
		const url = this.resolveUrl(model.id, model.url);
		const modelConfiguration = model.configuration?.models?.find(m => m.id === model.id);
		const configuredModel = modelConfiguration ?? this.getConfiguredModelPickerModel(model.id);
		const modelCapabilities = {
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			toolCalling: !!model.capabilities?.toolCalling || false,
			vision: !!model.capabilities?.imageInput || false,
			name: model.name,
			url,
			thinking: configuredModel?.thinking ?? false,
			streaming: configuredModel?.streaming,
			editTools: configuredModel?.editTools,
			requestHeaders: configuredModel?.requestHeaders,
			zeroDataRetentionEnabled: configuredModel?.zeroDataRetentionEnabled
		};
		const modelInfo = resolveModelInfo(model.id, this._name, undefined, modelCapabilities);
		if (modelCapabilities?.url?.includes('/responses')) {
			modelInfo.supported_endpoints = [
				ModelSupportedEndpoint.ChatCompletions,
				ModelSupportedEndpoint.Responses
			];
		}
		return this._instantiationService.createInstance(OpenAIEndpoint, modelInfo, configuredModel?.apiKey ?? model.configuration?.apiKey ?? '', url);
	}

	protected getModelsBaseUrl(configuration: CustomOAIModelProviderConfig | undefined): string | undefined {
		return configuration?.url;
	}

	protected getConfiguredModelPickerModel(modelId: string): CustomOAIModelConfig | undefined {
		return undefined;
	}

	protected abstract resolveUrl(modelId: string, url: string): string;
}

export class CustomOAIBYOKModelProvider extends AbstractCustomOAIBYOKModelProvider {

	static readonly providerName: string = 'CustomOAI';
	private providerName: string = CustomOAIBYOKModelProvider.providerName;

	constructor(
		_byokStorageService: IBYOKStorageService,
		@ILogService logService: ILogService,
		@IFetcherService fetcherService: IFetcherService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IExperimentationService expService: IExperimentationService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext
	) {
		super(CustomOAIBYOKModelProvider.providerName.toLowerCase(), CustomOAIBYOKModelProvider.providerName, _byokStorageService, logService, fetcherService, instantiationService, configurationService, expService, extensionContext);
		void this.migrateExistingConfigs();
	}

	// TODO: Remove this after 6 months
	private async migrateExistingConfigs(): Promise<void> {
		await this.migrateConfig(ConfigKey.Deprecated.CustomOAIModels, this.providerName, this.providerName);
	}

	protected resolveUrl(modelId: string, url: string): string {
		return resolveCustomOAIUrl(modelId, url);
	}
}
