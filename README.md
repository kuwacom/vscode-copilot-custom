# vscode-copilot-custom

Enables external OpenAI-compatible APIs for VSCode Copilot autocomplete.
VSCodeのCopilot拡張機能のauto completeに外部OpenAI互換APIを設定できるようにしたバージョン

# EN

This fork customizes GitHub Copilot Chat so inline completions can be routed to an external OpenAI-compatible API, while keeping the rest of the Copilot UX close to the original extension.

## What Changed

- Added an external OpenAI-compatible provider for autocomplete / ghost text
- Added support for both `/v1/completions` and `/v1/chat/completions`
- Added automatic retry without `suffix` when a proxy rejects `suffix`
- Added a custom OpenAI-compatible provider override for Ctrl+I inline chat edits
- Kept `customOAIModels` available for chat, inline chat, and model picker based edit flows

## Configuration

This fork has three main configuration paths:

1. `inlineEdits` custom completions provider for autocomplete / ghost text
2. `inlineChat.customProvider` for Ctrl+I inline chat edits
3. `customOAIModels` for chat, inline chat, and model picker based editing

### 1. Autocomplete / ghost text via external OpenAI-compatible API

Use these settings to route autocomplete to an external OpenAI-compatible API:

```json
{
  "github.copilot.chat.advanced.inlineEdits.githubCompletionsProvider.enabled": true,
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.url": "https://example.com/v1/completions",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.model": "your-model-id",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.mode": "completions"
}
```

You can also use chat completions instead:

```json
{
  "github.copilot.chat.advanced.inlineEdits.githubCompletionsProvider.enabled": true,
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.url": "https://example.com/v1/chat/completions",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.model": "your-model-id",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.mode": "chat-completions"
}
```

Notes:

- `mode: "completions"` uses the legacy-style completions request and sends `prompt` and `suffix`
- `mode: "chat-completions"` wraps the editing context into chat messages and sends it to `/v1/chat/completions`
- If you specify a base URL like `https://example.com`, this fork auto-expands it to `/v1/completions` or `/v1/chat/completions` depending on `mode`
- If your proxy rejects `suffix`, this fork automatically retries once without `suffix`

### 2. Ctrl+I inline chat edits via external OpenAI-compatible API

Use these settings to route Ctrl+I inline chat edit requests directly to an external OpenAI-compatible API:

```json
{
  "github.copilot.chat.advanced.inlineChat.customProvider.enabled": true,
  "github.copilot.chat.advanced.inlineChat.customProvider.provider": "CustomOAI",
  "github.copilot.chat.advanced.inlineChat.customProvider.url": "https://example.com/v1/chat/completions",
  "github.copilot.chat.advanced.inlineChat.customProvider.model": "your-model-id",
  "github.copilot.chat.advanced.inlineChat.customProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.inlineChat.customProvider.maxInputTokens": 128000,
  "github.copilot.chat.advanced.inlineChat.customProvider.maxOutputTokens": 16000
}
```

Notes:

- This path is for Ctrl+I editor inline chat and inline edit requests
- `provider` is a label used for the custom backend; the request format is OpenAI-compatible
- If you specify a base URL like `https://example.com`, this fork expands it to `/v1/chat/completions`
- If you specify `/v1/chat/completions` or `/v1/responses` explicitly, that API path is used as-is
- The custom inline chat endpoint assumes tool calling support because Copilot inline editing uses edit tools

### 3. Chat / inline chat / edit models via customOAIModels

Use `customOAIModels` to add external OpenAI-compatible models to the chat model picker:

```json
{
  "github.copilot.chat.customOAIModels": {
    "my-chat-model": {
      "name": "My Chat Model",
      "url": "https://example.com/v1/chat/completions",
      "toolCalling": true,
      "vision": false,
      "maxInputTokens": 128000,
      "maxOutputTokens": 16000
    }
  }
}
```

API key note:

- Do not put the API key inside each `customOAIModels` entry
- `customOAIModels` is only for model definitions
- The API key is managed separately by the language model provider configuration / model setup flow
- For the autocomplete provider added by this fork, the API key is configured with `github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey`

After adding the model, select it from the Copilot chat model picker for normal chat, inline chat, and edit flows that use chat models.

## Debugging

To run this fork in an Extension Development Host:

1. Install dependencies
   ```powershell
   corepack npm install
   ```
2. Build the extension
   ```powershell
   node .esbuild.ts --sourcemaps
   ```
3. Open this repository in VS Code
4. Press `F5`
5. Configure the Development Host with the settings you want to test

## Install as VSIX

To use it as a normal extension after debugging:

1. Install dependencies
   ```powershell
   corepack npm install
   ```
2. Build the extension
   ```powershell
   node .esbuild.ts --sourcemaps
   ```
3. Package it as a VSIX
   ```powershell
   node node_modules\@vscode\vsce\vsce package
   ```
4. Install the generated `.vsix` in VS Code
   - Open Extensions view
   - Open the `...` menu
   - Select `Install from VSIX...`
   - Choose the generated VSIX file

It is recommended to use a separate VS Code profile when testing this fork alongside the official GitHub Copilot extension.

## Upstream

Original repository:

- https://github.com/microsoft/vscode-copilot-chat

# JA

このフォークは GitHub Copilot Chat をベースに、inline completion を外部 OpenAI 互換 API に流せるようにしたバージョンです。
Copilot 本来の UI や操作感はできるだけそのまま維持しています。

## 何を変更したか

- autocomplete / ghost text を外部 OpenAI 互換 API に向けられるようにした
- `/v1/completions` と `/v1/chat/completions` の両方に対応した
- proxy 側が `suffix` を受け付けない場合は `suffix` なしで自動再試行するようにした
- Ctrl+I の inline chat edit を外部 OpenAI 互換 API に直接向けられるようにした
- chat / inline chat / model picker 系は `customOAIModels` で外部モデル追加できるままにした

## 設定方法

このフォークでは、主に次の 3 系統の設定があります。

1. `inlineEdits` の custom completions provider
2. `inlineChat.customProvider` による Ctrl+I inline chat edit 用 provider
3. `customOAIModels` による chat / inline chat / model picker 用モデル追加

### 1. Autocomplete / ghost text を外部 OpenAI 互換 API に向ける

autocomplete を外部 API に向ける場合は、次の設定を使います。

```json
{
  "github.copilot.chat.advanced.inlineEdits.githubCompletionsProvider.enabled": true,
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.url": "https://example.com/v1/completions",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.model": "your-model-id",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.mode": "completions"
}
```

`/v1/chat/completions` を使う場合はこうです。

```json
{
  "github.copilot.chat.advanced.inlineEdits.githubCompletionsProvider.enabled": true,
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.url": "https://example.com/v1/chat/completions",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.model": "your-model-id",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.inlineEdits.completionsProvider.mode": "chat-completions"
}
```

補足:

- `mode: "completions"` は古い completions 形式で、`prompt` と `suffix` を送ります
- `mode: "chat-completions"` は編集コンテキストを chat message に包んで `/v1/chat/completions` に送ります
- `https://example.com` のような base URL を指定した場合は、`mode` に応じて `/v1/completions` または `/v1/chat/completions` を自動補完します
- proxy 側が `suffix` を受け付けない場合は、自動で `suffix` なしで 1 回だけ再試行します

### 2. Ctrl+I inline chat edit を外部 OpenAI 互換 API に向ける

Ctrl+I の editor inline chat edit を外部 API に直接向ける場合は、次の設定を使います。

```json
{
  "github.copilot.chat.advanced.inlineChat.customProvider.enabled": true,
  "github.copilot.chat.advanced.inlineChat.customProvider.provider": "CustomOAI",
  "github.copilot.chat.advanced.inlineChat.customProvider.url": "https://example.com/v1/chat/completions",
  "github.copilot.chat.advanced.inlineChat.customProvider.model": "your-model-id",
  "github.copilot.chat.advanced.inlineChat.customProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.inlineChat.customProvider.maxInputTokens": 128000,
  "github.copilot.chat.advanced.inlineChat.customProvider.maxOutputTokens": 16000
}
```

補足:

- この設定は Ctrl+I の editor inline chat / inline edit request に効きます
- `provider` は custom backend のラベルで、リクエスト形式は OpenAI 互換です
- `https://example.com` のような base URL を指定した場合は `/v1/chat/completions` を自動補完します
- `/v1/chat/completions` または `/v1/responses` まで明示した場合は、その API path をそのまま使います
- Copilot の inline editing は edit tool を使うため、この custom inline chat endpoint は tool calling 対応前提です

### 3. Chat / inline chat / edit 用モデルを customOAIModels で追加する

通常の chat や inline chat、model picker ベースの edit に外部モデルを追加するには `customOAIModels` を使います。

```json
{
  "github.copilot.chat.customOAIModels": {
    "my-chat-model": {
      "name": "My Chat Model",
      "url": "https://example.com/v1/chat/completions",
      "toolCalling": true,
      "vision": false,
      "maxInputTokens": 128000,
      "maxOutputTokens": 16000
    }
  }
}
```

API キーについて:

- `customOAIModels` の各モデル定義の中には API キーを書きません
- `customOAIModels` はあくまでモデル定義だけを持つ設定です
- API キー自体は language model provider 側の設定 / モデル追加フローで別管理されます
- このフォークで追加した autocomplete 用 provider では `github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey` に設定します

追加後は Copilot chat のモデルピッカーからそのモデルを選ぶことで、通常の chat や inline chat、edit 系フローで使えます。

## デバッグ手順

Extension Development Host で動作確認する手順です。

1. 依存を入れる
   ```powershell
   corepack npm install
   ```
2. 拡張をビルドする
   ```powershell
   node .esbuild.ts --sourcemaps
   ```
3. このリポジトリを VS Code で開く
4. `F5` を押す
5. Development Host 側でテストしたい設定を入れる

## VSIX として通常利用する手順

デバッグ後に普通の拡張機能として使うには、次の流れです。

1. 依存を入れる
   ```powershell
   corepack npm install
   ```
2. 拡張をビルドする
   ```powershell
   node .esbuild.ts --sourcemaps
   ```
3. VSIX を作る
   ```powershell
   node node_modules\@vscode\vsce\vsce package
   ```
4. 生成された `.vsix` を VS Code に入れる
   - Extensions view を開く
   - `...` メニューを開く
   - `Install from VSIX...` を選ぶ
   - 生成された VSIX を選ぶ

公式 GitHub Copilot 拡張と併用する場合は、別 Profile で使うのをおすすめします。

## 元リポジトリ

- https://github.com/microsoft/vscode-copilot-chat
