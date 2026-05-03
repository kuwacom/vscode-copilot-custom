/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageModelChat, type ChatRequest } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ChatEndpointFamily, CustomModel, EmbeddingsEndpointFamily, IChatModelInformation, ICompletionModelInformation, IEmbeddingModelInformation, IEndpointProvider, ModelSupportedEndpoint } from '../../../platform/endpoint/common/endpointProvider';
import { AutoChatEndpoint } from '../../../platform/endpoint/node/autoChatEndpoint';
import { IAutomodeService } from '../../../platform/endpoint/node/automodeService';
import { CopilotChatEndpoint } from '../../../platform/endpoint/node/copilotChatEndpoint';
import { EmbeddingEndpoint } from '../../../platform/endpoint/node/embeddingsEndpoint';
import { IModelMetadataFetcher, ModelMetadataFetcher } from '../../../platform/endpoint/node/modelMetadataFetcher';
import { ExtensionContributedChatEndpoint } from '../../../platform/endpoint/vscode-node/extChatEndpoint';
import { ILogService } from '../../../platform/log/common/logService';
import { IChatEndpoint, IEmbeddingsEndpoint } from '../../../platform/networking/common/networking';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ChatRequestEditorData } from '../../../vscodeTypes';
import { BYOKModelCapabilities, resolveModelInfo } from '../../byok/common/byokProvider';
import { OpenAIEndpoint } from '../../byok/node/openAIEndpoint';
import { CustomOAIModelConfig, getConfiguredCustomModelPickerModels, resolveCustomOAIUrl } from '../../byok/vscode-node/customOAIProvider';

interface CustomOpenAIEndpointOptions {
	provider: string;
	url: string;
	apiKey: string;
	model: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	toolCalling: boolean;
	vision: boolean;
}

export class ProductionEndpointProvider extends Disposable implements IEndpointProvider {
	private static readonly customModelOwnerName = 'VSCode Copilot Custom';
	private static readonly customModelKeyName = 'customModelPicker';

	declare readonly _serviceBrand: undefined;

	private readonly _onDidModelsRefresh = this._register(new Emitter<void>());
	readonly onDidModelsRefresh: Event<void> = this._onDidModelsRefresh.event;

	private _chatEndpoints: Map<string, IChatEndpoint> = new Map();
	private _embeddingEndpoints: Map<string, IEmbeddingsEndpoint> = new Map();
	private _customModelPickerEndpoints: Map<string, IChatEndpoint> = new Map();
	private readonly _modelFetcher: IModelMetadataFetcher;

	constructor(
		@IAutomodeService private readonly _autoModeService: IAutomodeService,
		@ILogService protected readonly _logService: ILogService,
		@IConfigurationService protected readonly _configService: IConfigurationService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@IAuthenticationService protected readonly _authService: IAuthenticationService,
	) {
		super();

		this._modelFetcher = this._instantiationService.createInstance(ModelMetadataFetcher,
			false,
		);

		// When new models come in from CAPI we want to clear our local caches and let the endpoints be recreated since there may be new info
		this._register(this._modelFetcher.onDidModelsRefresh(() => {
			this._chatEndpoints.clear();
			this._embeddingEndpoints.clear();
			this._onDidModelsRefresh.fire();
		}));
		this._register(this._configService.onDidChangeConfiguration(event => {
			if (
				event.affectsConfiguration(ConfigKey.CustomModelPickerEnabled.fullyQualifiedId) ||
				event.affectsConfiguration(ConfigKey.CustomModelPickerModels.fullyQualifiedId)
			) {
				this._customModelPickerEndpoints.clear();
				this._onDidModelsRefresh.fire();
			}
		}));
	}

	private getOrCreateChatEndpointInstance(modelMetadata: IChatModelInformation): IChatEndpoint {
		const modelId = modelMetadata.id;
		let chatEndpoint = this._chatEndpoints.get(modelId);
		if (!chatEndpoint) {
			chatEndpoint = this._instantiationService.createInstance(CopilotChatEndpoint, modelMetadata);
			this._chatEndpoints.set(modelId, chatEndpoint);
		}
		return chatEndpoint;
	}

	private getRequestLanguageModel(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): LanguageModelChat | undefined {
		if (typeof requestOrFamilyOrModel === 'string') {
			return undefined;
		}
		return 'model' in requestOrFamilyOrModel ? requestOrFamilyOrModel.model : requestOrFamilyOrModel;
	}

	private getCustomModelPickerTag(): CustomModel {
		return {
			owner_name: ProductionEndpointProvider.customModelOwnerName,
			key_name: ProductionEndpointProvider.customModelKeyName
		};
	}

	private getCustomModelPickerEndpointById(modelId: string): IChatEndpoint | undefined {
		const configuredModel = getConfiguredCustomModelPickerModels(this._configService, this._logService).find(model => model.id === modelId);
		if (!configuredModel) {
			return undefined;
		}

		let endpoint = this._customModelPickerEndpoints.get(modelId);
		if (!endpoint) {
			endpoint = this.createCustomModelPickerEndpoint(configuredModel);
			this._customModelPickerEndpoints.set(modelId, endpoint);
		}
		return endpoint;
	}

	private createCustomModelPickerEndpoint(model: CustomOAIModelConfig): IChatEndpoint {
		const resolvedUrl = resolveCustomOAIUrl(model.id, model.url);
		const modelCapabilities: BYOKModelCapabilities = {
			name: model.name,
			url: resolvedUrl,
			maxInputTokens: model.maxInputTokens,
			maxOutputTokens: model.maxOutputTokens,
			toolCalling: model.toolCalling,
			vision: model.vision,
			thinking: model.thinking,
			streaming: model.streaming ?? true,
			editTools: model.editTools,
			requestHeaders: model.requestHeaders,
			zeroDataRetentionEnabled: model.zeroDataRetentionEnabled
		};
		const modelInfo = resolveModelInfo(model.id, 'CustomOAI', undefined, modelCapabilities);
		modelInfo.custom_model = this.getCustomModelPickerTag();
		if (resolvedUrl.includes('/responses')) {
			modelInfo.supported_endpoints = [
				ModelSupportedEndpoint.ChatCompletions,
				ModelSupportedEndpoint.Responses
			];
		}
		return this._instantiationService.createInstance(
			OpenAIEndpoint,
			modelInfo,
			model.apiKey ?? '',
			resolvedUrl
		);
	}

	private getCustomModelPickerEndpoints(): IChatEndpoint[] {
		const endpoints: IChatEndpoint[] = [];
		const existingIds = new Set<string>();
		for (const model of getConfiguredCustomModelPickerModels(this._configService, this._logService)) {
			if (existingIds.has(model.id)) {
				continue;
			}
			const endpoint = this.getCustomModelPickerEndpointById(model.id);
			if (endpoint) {
				endpoints.push(endpoint);
				existingIds.add(model.id);
			}
		}
		return endpoints;
	}

	private createCustomOpenAIEndpoint(options: CustomOpenAIEndpointOptions): IChatEndpoint {
		const provider = options.provider.trim() || 'CustomOAI';
		const resolvedUrl = resolveCustomOAIUrl(options.model, options.url);
		const modelCapabilities: BYOKModelCapabilities = {
			name: `${provider}: ${options.model}`,
			url: resolvedUrl,
			maxInputTokens: options.maxInputTokens,
			maxOutputTokens: options.maxOutputTokens,
			toolCalling: options.toolCalling,
			vision: options.vision,
			streaming: true,
		};
		const modelInfo = resolveModelInfo(options.model, provider, undefined, modelCapabilities);
		if (resolvedUrl.includes('/responses')) {
			modelInfo.supported_endpoints = [
				ModelSupportedEndpoint.ChatCompletions,
				ModelSupportedEndpoint.Responses
			];
		}
		return this._instantiationService.createInstance(
			OpenAIEndpoint,
			modelInfo,
			options.apiKey,
			resolvedUrl
		);
	}

	private getInlineChatCustomEndpoint(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): IChatEndpoint | undefined {
		if (typeof requestOrFamilyOrModel === 'string' || !('location2' in requestOrFamilyOrModel) || !(requestOrFamilyOrModel.location2 instanceof ChatRequestEditorData)) {
			return undefined;
		}
		const requestModel = this.getRequestLanguageModel(requestOrFamilyOrModel);
		if (requestModel && requestModel.vendor !== 'copilot') {
			return undefined;
		}

		if (!this._configService.getConfig(ConfigKey.Advanced.InlineChatCustomProviderEnabled)) {
			return undefined;
		}

		const url = this._configService.getConfig(ConfigKey.Advanced.InlineChatCustomProviderUrl)?.trim();
		const model = this._configService.getConfig(ConfigKey.Advanced.InlineChatCustomProviderModel)?.trim();
		if (!url || !model) {
			this._logService.warn('[custom-inline-chat] enabled but url or model is empty');
			return undefined;
		}

		return this.createCustomOpenAIEndpoint({
			provider: this._configService.getConfig(ConfigKey.Advanced.InlineChatCustomProviderProvider),
			url,
			apiKey: this._configService.getConfig(ConfigKey.Advanced.InlineChatCustomProviderApiKey) ?? '',
			model,
			maxInputTokens: this._configService.getConfig(ConfigKey.Advanced.InlineChatCustomProviderMaxInputTokens),
			maxOutputTokens: this._configService.getConfig(ConfigKey.Advanced.InlineChatCustomProviderMaxOutputTokens),
			toolCalling: true,
			vision: false,
		});
	}

	private getPanelChatCustomEndpoint(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): IChatEndpoint | undefined {
		if (typeof requestOrFamilyOrModel === 'string' || !('location2' in requestOrFamilyOrModel) || requestOrFamilyOrModel.location2 !== undefined) {
			return undefined;
		}
		const requestModel = this.getRequestLanguageModel(requestOrFamilyOrModel);
		if (requestModel && requestModel.vendor !== 'copilot') {
			return undefined;
		}

		if (!this._configService.getConfig(ConfigKey.Advanced.PanelChatCustomProviderEnabled)) {
			return undefined;
		}

		const url = this._configService.getConfig(ConfigKey.Advanced.PanelChatCustomProviderUrl)?.trim();
		const model = this._configService.getConfig(ConfigKey.Advanced.PanelChatCustomProviderModel)?.trim();
		if (!url || !model) {
			this._logService.warn('[custom-panel-chat] enabled but url or model is empty');
			return undefined;
		}

		return this.createCustomOpenAIEndpoint({
			provider: this._configService.getConfig(ConfigKey.Advanced.PanelChatCustomProviderProvider),
			url,
			apiKey: this._configService.getConfig(ConfigKey.Advanced.PanelChatCustomProviderApiKey) ?? '',
			model,
			maxInputTokens: this._configService.getConfig(ConfigKey.Advanced.PanelChatCustomProviderMaxInputTokens),
			maxOutputTokens: this._configService.getConfig(ConfigKey.Advanced.PanelChatCustomProviderMaxOutputTokens),
			toolCalling: true,
			vision: false,
		});
	}

	async getChatEndpoint(requestOrFamilyOrModel: LanguageModelChat | ChatRequest | ChatEndpointFamily): Promise<IChatEndpoint> {
		this._logService.trace(`Resolving chat model`);

		const inlineChatCustomEndpoint = this.getInlineChatCustomEndpoint(requestOrFamilyOrModel);
		if (inlineChatCustomEndpoint) {
			return inlineChatCustomEndpoint;
		}

		const panelChatCustomEndpoint = this.getPanelChatCustomEndpoint(requestOrFamilyOrModel);
		if (panelChatCustomEndpoint) {
			return panelChatCustomEndpoint;
		}

		if (typeof requestOrFamilyOrModel === 'string') {
			try {
				const modelMetadata = await this._modelFetcher.getChatModelFromFamily(requestOrFamilyOrModel);
				return this.getOrCreateChatEndpointInstance(modelMetadata!);
			} catch {
				const customEndpoint = this.getCustomModelPickerEndpointById(requestOrFamilyOrModel);
				if (customEndpoint) {
					return customEndpoint;
				}
				throw new Error(`Unable to resolve chat model with family selection: ${requestOrFamilyOrModel}`);
			}
		}

		const model = this.getRequestLanguageModel(requestOrFamilyOrModel);

		if (!model) {
			return this.getChatEndpoint('copilot-base');
		}

		if (model.vendor !== 'copilot') {
			return this._instantiationService.createInstance(ExtensionContributedChatEndpoint, model);
		}

		if (model.id === AutoChatEndpoint.pseudoModelId) {
			try {
				const allEndpoints = await this.getAllChatEndpoints();
				return this._autoModeService.resolveAutoModeEndpoint(requestOrFamilyOrModel as ChatRequest, allEndpoints);
			} catch {
				return this.getChatEndpoint('copilot-base');
			}
		}

		const modelMetadata = await this._modelFetcher.getChatModelFromApiModel(model);
		if (!modelMetadata) {
			const customEndpoint = this.getCustomModelPickerEndpointById(model.id);
			if (customEndpoint) {
				return customEndpoint;
			}
		}
		// If we fail to resolve a model since this is panel we give copilot base. This really should never happen as the picker is powered by the same service.
		return modelMetadata ? this.getOrCreateChatEndpointInstance(modelMetadata) : this.getChatEndpoint('copilot-base');
	}

	async getEmbeddingsEndpoint(family?: EmbeddingsEndpointFamily): Promise<IEmbeddingsEndpoint> {
		this._logService.trace(`Resolving embedding model`);
		const modelMetadata = await this._modelFetcher.getEmbeddingsModel('text-embedding-3-small');
		const model = await this.getOrCreateEmbeddingEndpointInstance(modelMetadata);
		this._logService.trace(`Resolved embedding model`);
		return model;
	}

	private async getOrCreateEmbeddingEndpointInstance(modelMetadata: IEmbeddingModelInformation): Promise<IEmbeddingsEndpoint> {
		const modelId = 'text-embedding-3-small';
		let embeddingEndpoint = this._embeddingEndpoints.get(modelId);
		if (!embeddingEndpoint) {
			embeddingEndpoint = this._instantiationService.createInstance(EmbeddingEndpoint, modelMetadata);
			this._embeddingEndpoints.set(modelId, embeddingEndpoint);
		}
		return embeddingEndpoint;
	}

	async getAllCompletionModels(forceRefresh?: boolean): Promise<ICompletionModelInformation[]> {
		return this._modelFetcher.getAllCompletionModels(forceRefresh ?? false);
	}

	async getAllChatEndpoints(): Promise<IChatEndpoint[]> {
		const models: IChatModelInformation[] = await this._modelFetcher.getAllChatModels();
		const endpoints = models.map(model => this.getOrCreateChatEndpointInstance(model));
		const existingIds = new Set(endpoints.map(endpoint => endpoint.model));
		for (const customEndpoint of this.getCustomModelPickerEndpoints()) {
			if (existingIds.has(customEndpoint.model)) {
				this._logService.warn(`[custom-model-picker] skipping model '${customEndpoint.model}' because it conflicts with an existing built-in model id`);
				continue;
			}
			endpoints.push(customEndpoint);
		}
		return endpoints;
	}
}
