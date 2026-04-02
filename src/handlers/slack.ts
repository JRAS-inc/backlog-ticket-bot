import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import * as crypto from "crypto";
import { analyzeAndStructure } from "../services/ai";
import { createIssue } from "../services/backlog";

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET!;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;

function verifySlackRequest(event: APIGatewayProxyEvent): boolean {
  const timestamp = event.headers["X-Slack-Request-Timestamp"] || "";
  const signature = event.headers["X-Slack-Signature"] || "";
  const body = event.body || "";

  // リプレイ攻撃防止: 5分以上前のリクエストを拒否
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", SLACK_SIGNING_SECRET)
      .update(sigBasestring)
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

async function postSlackMessage(
  channel: string,
  text: string,
  threadTs?: string
) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify({
      channel,
      text,
      ...(threadTs && { thread_ts: threadTs }),
    }),
  });
}

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  // 署名検証
  if (!verifySlackRequest(event)) {
    return { statusCode: 401, body: "Invalid signature" };
  }

  const payload = JSON.parse(event.body || "{}");

  // Slack URL Verification
  if (payload.type === "url_verification") {
    return {
      statusCode: 200,
      body: JSON.stringify({ challenge: payload.challenge }),
    };
  }

  // Event処理
  if (payload.type === "event_callback") {
    const slackEvent = payload.event;

    // ボット自身のメッセージは無視
    if (slackEvent.bot_id) {
      return { statusCode: 200, body: "ok" };
    }

    // app_mention イベント
    if (slackEvent.type === "app_mention") {
      const text: string = slackEvent.text || "";
      const channel: string = slackEvent.channel;
      const threadTs: string = slackEvent.thread_ts || slackEvent.ts;
      const user: string = slackEvent.user;

      try {
        // AIで整理
        const ticket = await analyzeAndStructure(text, "slack");

        // Backlogに起票
        const issue = await createIssue(
          ticket,
          `Slack (User: <@${user}>, Channel: ${channel})`
        );

        const issueUrl = `https://${process.env.BACKLOG_SPACE_ID}.backlog.com/view/${issue.issueKey}`;

        await postSlackMessage(
          channel,
          `チケットを作成しました:\n*${issue.issueKey}* ${issue.summary}\n${issueUrl}`,
          threadTs
        );
      } catch (error) {
        console.error("Slack処理エラー:", error);
        await postSlackMessage(
          channel,
          "チケット作成中にエラーが発生しました。管理者に連絡してください。",
          threadTs
        );
      }

      return { statusCode: 200, body: "ok" };
    }
  }

  return { statusCode: 200, body: "ok" };
}
