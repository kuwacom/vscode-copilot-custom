/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LanguageModelChatInformation, LanguageModelChatProvider, lm } from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ICAPIClientService } from '../../../platform/endpoint/common/capiClient';
import { IVSCodeExtensionContext } from '../../../platform/extContext/common/extensionContext';
import { ILogService } from '../../../platform/log/common/logService';
import { IFetcherService } from '../../../platform/networking/common/fetcherService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { BYOKKnownModels, isBYOKEnabled } from '../../byok/common/byokProvider';
import { IExtensionContribution } from '../../common/contributions';
import { AnthropicLMProvider } from './anthropicProvider';
import { AzureBYOKModelProvider } from './azureProvider';
import { BYOKStorageService, IBYOKStorageService } from './byokStorageService';
import { CustomOAIBYOKModelProvider } from './customOAIProvider';
import { GeminiNativeBYOKLMProvider } from './geminiNativeProvider';
import { OllamaLMProvider } from './ollamaProvider';
import { OAIBYOKLMProvider } from './openAIProvider';
import { OpenRouterLMProvider } from './openRouterProvider';
import { XAIBYOKLMProvider } from './xAIProvider';

interface RefreshableLanguageModelChatProvider extends LanguageModelChatProvider<LanguageModelChatInformation> {
	refreshLanguageModelChatInformation?: () => void;
}

export class BYOKContrib extends Disposable implements IExtensionContribution {
	public readonly id: string = 'byok-contribution';
	private readonly _byokStorageService: IBYOKStorageService;
	private readonly _providers: Map<string, RefreshableLanguageModelChatProvider> = new Map();

	constructor(
		@IFetcherService private readonly _fetcherService: IFetcherService,
		@ILogService private readonly _logService: ILogService,
		@ICAPIClientService private readonly _capiClientService: ICAPIClientService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IVSCodeExtensionContext extensionContext: IVSCodeExtensionContext,
		@IAuthenticationService authService: IAuthenticationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();
		this._byokStorageService = new BYOKStorageService(extensionContext);
		void this._authChange(authService, this._instantiationService);

		this._register(authService.onDidAuthenticationChange(() => {
			void this._authChange(authService, this._instantiationService);
		}));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			if (
				event.affectsConfiguration(ConfigKey.CustomModelPickerEnabled.fullyQualifiedId) ||
				event.affectsConfiguration(ConfigKey.CustomModelPickerModels.fullyQualifiedId)
			) {
				void this._authChange(authService, this._instantiationService).then(
					() => this._notifyLanguageModelChatInformationChanged(),
					error => this._logService.error(error, 'BYOK: Failed to refresh providers after custom model picker configuration changed.')
				);
			}
		}));
	}

	private async _authChange(authService: IAuthenticationService, instantiationService: IInstantiationService) {
		const customModelPickerEnabled = this._configurationService.getConfig(ConfigKey.CustomModelPickerEnabled);
		const byokEnabled = authService.copilotToken ? isBYOKEnabled(authService.copilotToken, this._capiClientService) : false;
		if (!byokEnabled && !customModelPickerEnabled) {
			return;
		}

		const knownModels = byokEnabled && this._shouldRegisterBYOKProviders() ? await this.fetchKnownModelList(this._fetcherService) : {};
		if (this._store.isDisposed) {
			return;
		}

		if (byokEnabled) {
			if (!this._hasProvider(OllamaLMProvider.providerName)) {
				this._registerProvider(OllamaLMProvider.providerName, instantiationService.createInstance(OllamaLMProvider, this._byokStorageService));
			}
			if (!this._hasProvider(AnthropicLMProvider.providerName)) {
				this._registerProvider(AnthropicLMProvider.providerName, instantiationService.createInstance(AnthropicLMProvider, knownModels[AnthropicLMProvider.providerName], this._byokStorageService));
			}
			if (!this._hasProvider(GeminiNativeBYOKLMProvider.providerName)) {
				this._registerProvider(GeminiNativeBYOKLMProvider.providerName, instantiationService.createInstance(GeminiNativeBYOKLMProvider, knownModels[GeminiNativeBYOKLMProvider.providerName], this._byokStorageService));
			}
			if (!this._hasProvider(XAIBYOKLMProvider.providerName)) {
				this._registerProvider(XAIBYOKLMProvider.providerName, instantiationService.createInstance(XAIBYOKLMProvider, knownModels[XAIBYOKLMProvider.providerName], this._byokStorageService));
			}
			if (!this._hasProvider(OAIBYOKLMProvider.providerName)) {
				this._registerProvider(OAIBYOKLMProvider.providerName, instantiationService.createInstance(OAIBYOKLMProvider, knownModels[OAIBYOKLMProvider.providerName], this._byokStorageService));
			}
			if (!this._hasProvider(OpenRouterLMProvider.providerName)) {
				this._registerProvider(OpenRouterLMProvider.providerName, instantiationService.createInstance(OpenRouterLMProvider, this._byokStorageService));
			}
			if (!this._hasProvider(AzureBYOKModelProvider.providerName)) {
				this._registerProvider(AzureBYOKModelProvider.providerName, instantiationService.createInstance(AzureBYOKModelProvider, this._byokStorageService));
			}
		}

		if (!this._hasProvider(CustomOAIBYOKModelProvider.providerName)) {
			this._registerProvider(CustomOAIBYOKModelProvider.providerName, instantiationService.createInstance(CustomOAIBYOKModelProvider, this._byokStorageService));
		}
	}

	private _shouldRegisterBYOKProviders(): boolean {
		return [
			OllamaLMProvider.providerName,
			AnthropicLMProvider.providerName,
			GeminiNativeBYOKLMProvider.providerName,
			XAIBYOKLMProvider.providerName,
			OAIBYOKLMProvider.providerName,
			OpenRouterLMProvider.providerName,
			AzureBYOKModelProvider.providerName,
		].some(providerName => !this._providers.has(providerName.toLowerCase()));
	}

	private _hasProvider(providerName: string): boolean {
		return this._providers.has(providerName.toLowerCase());
	}

	private _registerProvider(providerName: string, provider: RefreshableLanguageModelChatProvider): void {
		const normalizedProviderName = providerName.toLowerCase();
		if (this._providers.has(normalizedProviderName)) {
			return;
		}
		this._providers.set(normalizedProviderName, provider);
		this._store.add(lm.registerLanguageModelChatProvider(normalizedProviderName, provider));
	}

	private _notifyLanguageModelChatInformationChanged(): void {
		for (const provider of this._providers.values()) {
			provider.refreshLanguageModelChatInformation?.();
		}
	}

	private async fetchKnownModelList(fetcherService: IFetcherService): Promise<Record<string, BYOKKnownModels>> {
		const data = await (await fetcherService.fetch('https://main.vscode-cdn.net/extensions/copilotChat.json', { method: 'GET', callSite: 'byok-known-models' })).json();
		// Use this for testing with changes from a local file. Don't check in
		// const data = JSON.parse((await this._fileSystemService.readFile(URI.file('/Users/roblou/code/vscode-engineering/chat/copilotChat.json'))).toString());
		let knownModels: Record<string, BYOKKnownModels>;
		if (data.version !== 1) {
			this._logService.warn('BYOK: Copilot Chat known models list is not in the expected format. Defaulting to empty list.');
			knownModels = {};
		} else {
			knownModels = data.modelInfo;
		}
		this._logService.info('BYOK: Copilot Chat known models list fetched successfully.');
		return knownModels;
	}
}
