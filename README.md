# backlog-ticket-bot

メールやSlackからの依頼をAI(Claude)で整理し、Nulab Backlogに自動起票するボット。

## 使い方

### メールから起票

**`ticket@ticket.yokoyama-lab.jp`** にメールを転送するだけ。

1. 起票したいメールを開く
2. 転送ボタンを押す
3. 一言コメントを書く(殴り書きでOK、誤字脱字はAIが補正します)
4. 宛先に `ticket@ticket.yokoyama-lab.jp` を入力して送信

AIが以下を自動で判断します:
- チケットのタイトル
- 説明文(背景、要望、対応事項を構造化)
- 優先度(高/中/低)
- 課題種別(タスク/バグ/要望/その他)

起票が完了すると、転送元のメールアドレスに確認メールが届きます。
失敗した場合もエラー内容の通知メールが届きます。

#### 例

```
宛先: ticket@ticket.yokoyama-lab.jp

これ対応おねがい、来週までに

---------- 転送されたメッセージ ----------
From: client@example.com
件名: システムのエラーについて

お世話になっております。
ログイン画面でエラーが出て...
```

この場合、AIが以下のようなチケットを作成します:
- タイトル: 「ログイン画面のエラー対応」
- 種別: バグ
- 優先度: 高(来週までにという期限あり)

### Slackから起票(準備中)

チャンネルでボットにメンションするとチケットが作成されます。
Slackアプリの設定が必要です(下記セットアップ参照)。

```
@backlog-bot 新規顧客のオンボーディング資料を作成してほしい。来週の火曜日までに。
```

## 構成

```
メール転送 → SES(us-east-1) → S3 → Lambda → Claude AI → Backlog 起票 → 確認メール返信
Slack メンション → API Gateway → Lambda → Claude AI → Backlog 起票 → スレッド返信
```

| コンポーネント | 用途 |
|---|---|
| AWS SES | メール受信 |
| AWS S3 | メール一時保存 |
| AWS Lambda | メール処理 / Slack処理 |
| Claude API | 内容の整理、タイトル/優先度/種別の自動判定 |
| Backlog API | チケット作成 |

## セットアップ

### 必要なもの

- AWS アカウント
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Nulab Backlog アカウント + APIキー
- Anthropic APIキー

### デプロイ

```bash
npm install
npm run build
sam deploy --guided --region us-east-1
```

パラメータ:

| パラメータ | 説明 |
|---|---|
| BacklogSpaceId | Backlogスペース名 (`xxx.backlog.com` の `xxx`) |
| BacklogApiKey | Backlog APIキー |
| BacklogProjectId | プロジェクトID |
| BacklogIssueTypeId | デフォルト課題種別ID |
| AnthropicApiKey | Anthropic APIキー |
| SlackBotToken | Slack Bot Token (後から設定可) |
| SlackSigningSecret | Slack Signing Secret (後から設定可) |

### Slack連携の追加設定

1. [Slack API](https://api.slack.com/apps) で新しいAppを作成
2. **Event Subscriptions** を有効化、Request URLにデプロイ出力の `SlackWebhookUrl` を設定
3. **Subscribe to bot events** で `app_mention` を追加
4. **OAuth & Permissions** で `chat:write` スコープを追加
5. ワークスペースにインストールしてBot Tokenを取得
6. SAMのパラメータを更新して再デプロイ
