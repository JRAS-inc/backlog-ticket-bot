import { SESEvent, Context } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { simpleParser } from "mailparser";
import { analyzeAndStructure } from "../services/ai";
import { createIssue } from "../services/backlog";

const s3 = new S3Client({});
const ses = new SESClient({ region: "us-east-1" });

const REPLY_FROM = "ticket@ticket.yokoyama-lab.jp";

async function sendReply(to: string, subject: string, body: string) {
  await ses.send(
    new SendEmailCommand({
      Source: REPLY_FROM,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Text: { Data: body, Charset: "UTF-8" } },
      },
    })
  );
}

// 転送メールの区切りパターン (主要メールクライアント対応)
const FORWARD_SEPARATORS = [
  /^---------- Forwarded message ---------$/m, // Gmail
  /^-------- Original Message --------$/m, // Thunderbird
  /^Begin forwarded message:$/m, // Apple Mail
  /^-{2,}\s*転送メッセージ\s*-{2,}$/m, // Gmail日本語
  /^-{2,}\s*Original Message\s*-{2,}$/m, // Outlook
  /^>{3,}/m, // 引用記号
];

function splitForwardedEmail(body: string): {
  comment: string;
  originalBody: string;
} {
  for (const sep of FORWARD_SEPARATORS) {
    const match = body.match(sep);
    if (match && match.index !== undefined) {
      const comment = body.slice(0, match.index).trim();
      const originalBody = body.slice(match.index).trim();
      return { comment, originalBody };
    }
  }
  // 区切りが見つからない場合はそのまま全文
  return { comment: "", originalBody: body };
}

export async function handler(event: SESEvent, _context: Context) {
  for (const record of event.Records) {
    const messageId = record.ses.mail.messageId;
    const bucketName = process.env.EMAIL_BUCKET_NAME;

    if (!bucketName) {
      console.error("EMAIL_BUCKET_NAME が設定されていません");
      continue;
    }

    let from = "不明";

    try {
      // S3からメール本文を取得
      const s3Response = await s3.send(
        new GetObjectCommand({
          Bucket: bucketName,
          Key: `incoming/${messageId}`,
        })
      );

      const rawEmail = await s3Response.Body?.transformToString();
      if (!rawEmail) {
        console.error("メール本文が空です:", messageId);
        continue;
      }

      // メールをパース
      const parsed = await simpleParser(rawEmail);
      const subject = parsed.subject || "(件名なし)";
      const body = parsed.text || parsed.html || "(本文なし)";
      from = parsed.from?.text || "不明";

      // 転送メールのコメント部分と元メールを分離
      const { comment, originalBody } = splitForwardedEmail(body);

      const content = [
        `件名: ${subject}`,
        `転送者: ${from}`,
        comment ? `\n転送者コメント:\n${comment}` : "",
        `\n元メール本文:\n${originalBody}`,
      ].join("\n");

      // AIで整理
      const ticket = await analyzeAndStructure(content, "email");

      // Backlogに起票
      const issue = await createIssue(
        ticket,
        `メール (From: ${from}, Subject: ${subject})`
      );

      const issueUrl = `https://${process.env.BACKLOG_SPACE_ID}.backlog.com/view/${issue.issueKey}`;
      console.log(`起票完了: ${issue.issueKey} - ${issue.summary}`);

      // 転送者に確認メールを返信
      await sendReply(
        from,
        `[起票完了] ${issue.issueKey} ${issue.summary}`,
        `Backlogにチケットを作成しました。\n\n${issue.issueKey}: ${issue.summary}\n${issueUrl}`
      );
    } catch (error) {
      console.error("メール処理エラー:", messageId, error);

      if (from !== "不明") {
        await sendReply(
          from,
          "[起票失敗] チケット作成でエラーが発生しました",
          `チケットの自動作成中にエラーが発生しました。\n管理者に連絡してください。\n\nエラー: ${error instanceof Error ? error.message : String(error)}`
        ).catch(() => {});
      }
      throw error;
    }
  }
}
