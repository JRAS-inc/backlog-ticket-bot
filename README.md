# backlog-ticket-bot

メールやSlackからの依頼をAI(Claude)で整理し、Nulab Backlogに自動起票するボット。

## 仕組み

```
メール → SES → S3 → Lambda → Claude AI → Backlog 起票
Slack メンション → API Gateway → Lambda → Claude AI → Backlog 起票
```

- 指定のメールアドレスにメールを転送すると、AIが内容を読み取り、タイトル・説明・優先度を自動で整理してBacklogにチケットを作成
- Slackでボットにメンションすると、同様にチケットを作成してスレッドにリンクを返信

## 必要なもの

- AWS アカウント (SES, Lambda, S3, API Gateway)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Nulab Backlog アカウント + APIキー
- Anthropic APIキー
- Slack App (Bot Token + Signing Secret)

## セットアップ

### 1. Backlog APIキーの取得

1. Backlogにログイン → 個人設定 → API → 「新しいAPIキーを発行」
2. プロジェクトIDと課題種別IDを確認 (プロジェクト設定から確認可能)

### 2. Slack Appの作成

1. [Slack API](https://api.slack.com/apps) で新しいAppを作成
2. **Event Subscriptions** を有効化
3. **Subscribe to bot events** で `app_mention` を追加
4. **OAuth & Permissions** で `chat:write` スコープを追加
5. ワークスペースにインストールして Bot Token を取得

### 3. SES ドメイン設定

1. AWS SES でメール受信用のドメインを検証
2. MXレコードを設定 (例: `10 inbound-smtp.ap-northeast-1.amazonaws.com`)

### 4. デプロイ

```bash
npm install
npm run build
sam deploy --guided
```

初回デプロイ時にパラメータを聞かれるので、以下を入力:

| パラメータ | 説明 |
|---|---|
| BacklogSpaceId | Backlogのスペース名 (URLの `xxx.backlog.com` の `xxx`) |
| BacklogApiKey | Backlog APIキー |
| BacklogProjectId | 起票先プロジェクトのID |
| BacklogIssueTypeId | 課題種別のID |
| AnthropicApiKey | Anthropic APIキー |
| SlackBotToken | Slack Bot Token (`xoxb-...`) |
| SlackSigningSecret | Slack Signing Secret |

### 5. Slack Request URLの設定

デプロイ後に出力される `SlackWebhookUrl` を、SlackアプリのEvent SubscriptionsのRequest URLに設定。

## 使い方

### メールから起票
設定したメールアドレスにメールを転送するだけ。AIが自動で整理して起票します。

### Slackから起票
チャンネルでボットにメンション:
```
@backlog-bot 新規顧客のオンボーディング資料を作成してほしい。来週の火曜日までに。
```
ボットがチケットを作成し、スレッドにリンクを返信します。

## 開発

```bash
npm install
npm run build
```
