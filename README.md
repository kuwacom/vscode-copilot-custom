# vscode-copilot-custom

Enables external OpenAI-compatible APIs for VSCode Copilot autocomplete.
VSCodeのCopilot拡張機能のauto completeに外部OpenAI互換APIを設定できるようにしたバージョン

# EN

This fork customizes GitHub Copilot Chat so inline completions, Ctrl+I inline chat edits, and normal Copilot Chat panel requests can be routed to external OpenAI-compatible APIs, while keeping the rest of the Copilot UX close to the original extension.

## What Changed

- Added an external OpenAI-compatible provider for autocomplete / ghost text
- Added support for both `/v1/completions` and `/v1/chat/completions`
- Added automatic retry without `suffix` when a proxy rejects `suffix`
- Added a custom OpenAI-compatible provider override for Ctrl+I inline chat edits
- Added a custom OpenAI-compatible provider override for normal Copilot Chat panel requests

## Configuration

This fork has three main configuration paths:

1. `inlineEdits` custom completions provider for autocomplete / ghost text
2. `inlineChat.customProvider` for Ctrl+I inline chat edits
3. `panelChat.customProvider` for normal Copilot Chat panel requests

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

### 3. Normal chat panel via external OpenAI-compatible API

Use these settings to route normal Copilot Chat panel requests directly to an external OpenAI-compatible API:

```json
{
  "github.copilot.chat.advanced.panelChat.customProvider.enabled": true,
  "github.copilot.chat.advanced.panelChat.customProvider.provider": "CustomOAI",
  "github.copilot.chat.advanced.panelChat.customProvider.url": "https://example.com/v1/chat/completions",
  "github.copilot.chat.advanced.panelChat.customProvider.model": "your-model-id",
  "github.copilot.chat.advanced.panelChat.customProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.panelChat.customProvider.maxInputTokens": 128000,
  "github.copilot.chat.advanced.panelChat.customProvider.maxOutputTokens": 16000
}
```

Notes:

- This path is for normal Copilot Chat panel requests
- When enabled, it overrides the selected Copilot model for normal Chat panel requests
- It does not affect Ctrl+I inline chat, autocomplete / ghost text, or internal model-family lookups such as `copilot-fast`
- `provider` is a label used for the custom backend; the request format is OpenAI-compatible
- If you specify a base URL like `https://example.com`, this fork expands it to `/v1/chat/completions`
- If you specify `/v1/chat/completions` or `/v1/responses` explicitly, that API path is used as-is
- The custom normal chat endpoint assumes tool calling support so agent-style chat can keep using Copilot tools

### API key settings

- Autocomplete / ghost text uses `github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey`
- Ctrl+I inline chat uses `github.copilot.chat.advanced.inlineChat.customProvider.apiKey`
- Normal Chat panel uses `github.copilot.chat.advanced.panelChat.customProvider.apiKey`
- Leave the API key empty for local endpoints that do not require authentication

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

このフォークは GitHub Copilot Chat をベースに、inline completion、Ctrl+I inline chat edit、通常の Copilot Chat panel request を外部 OpenAI 互換 API に流せるようにしたバージョンです。
Copilot 本来の UI や操作感はできるだけそのまま維持しています。

## 何を変更したか

- autocomplete / ghost text を外部 OpenAI 互換 API に向けられるようにした
- `/v1/completions` と `/v1/chat/completions` の両方に対応した
- proxy 側が `suffix` を受け付けない場合は `suffix` なしで自動再試行するようにした
- Ctrl+I の inline chat edit を外部 OpenAI 互換 API に直接向けられるようにした
- 通常の Copilot Chat panel request を外部 OpenAI 互換 API に直接向けられるようにした

## 設定方法

このフォークでは、主に次の 3 系統の設定があります。

1. `inlineEdits` の custom completions provider
2. `inlineChat.customProvider` による Ctrl+I inline chat edit 用 provider
3. `panelChat.customProvider` による通常の Copilot Chat panel 用 provider

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

### 3. 通常の Chat panel を外部 OpenAI 互換 API に向ける

通常の Copilot Chat panel request を外部 API に直接向ける場合は、次の設定を使います。

```json
{
  "github.copilot.chat.advanced.panelChat.customProvider.enabled": true,
  "github.copilot.chat.advanced.panelChat.customProvider.provider": "CustomOAI",
  "github.copilot.chat.advanced.panelChat.customProvider.url": "https://example.com/v1/chat/completions",
  "github.copilot.chat.advanced.panelChat.customProvider.model": "your-model-id",
  "github.copilot.chat.advanced.panelChat.customProvider.apiKey": "your-api-key",
  "github.copilot.chat.advanced.panelChat.customProvider.maxInputTokens": 128000,
  "github.copilot.chat.advanced.panelChat.customProvider.maxOutputTokens": 16000
}
```

補足:

- この設定は通常の Copilot Chat panel request に効きます
- 有効にすると通常の Chat panel request では選択中の Copilot model よりこちらの設定が優先されます
- Ctrl+I inline chat、autocomplete / ghost text、`copilot-fast` のような内部 model family lookup には影響しません
- `provider` は custom backend のラベルで、リクエスト形式は OpenAI 互換です
- `https://example.com` のような base URL を指定した場合は `/v1/chat/completions` を自動補完します
- `/v1/chat/completions` または `/v1/responses` まで明示した場合は、その API path をそのまま使います
- agent 系 chat でも Copilot tool を使えるようにするため、この custom normal chat endpoint は tool calling 対応前提です

### API key の設定

- Autocomplete / ghost text は `github.copilot.chat.advanced.inlineEdits.completionsProvider.apiKey` を使います
- Ctrl+I inline chat は `github.copilot.chat.advanced.inlineChat.customProvider.apiKey` を使います
- 通常の Chat panel は `github.copilot.chat.advanced.panelChat.customProvider.apiKey` を使います
- local endpoint など認証不要な場合は API key を空のままにします

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
