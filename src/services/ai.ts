import Anthropic from "@anthropic-ai/sdk";

export interface TicketData {
  summary: string;
  description: string;
  priorityId: number; // 2=高, 3=中, 4=低
  issueTypeId: number; // 課題種別
}

const client = new Anthropic();

const SYSTEM_PROMPT = `あなたはプロジェクト管理アシスタントです。
受け取ったメッセージ(メールやSlack)の内容を分析し、Backlogのチケットとして起票するための情報を整理してください。

以下のJSON形式で返してください:
{
  "summary": "チケットのタイトル(簡潔に、30文字以内)",
  "description": "チケットの説明(元の内容を整理し、背景・要望・対応事項を構造化)",
  "priorityId": 3,
  "issueTypeId": 4071592
}

priorityIdは以下の基準で判断してください:
- 2(高): 緊急、障害、期限が迫っている
- 3(中): 通常の依頼、改善要望
- 4(低): 要検討、情報共有

issueTypeIdは内容に応じて以下から選んでください:
- 4071592(タスク): 作業依頼、対応が必要なもの
- 4071591(バグ): 不具合報告、エラー、障害
- 4071593(要望): 機能追加、改善の提案
- 4071594(その他): 上記に当てはまらないもの

JSONのみを返してください。`;

export async function analyzeAndStructure(
  content: string,
  source: "email" | "slack"
): Promise<TicketData> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `以下の${source === "email" ? "メール" : "Slackメッセージ"}からチケット情報を抽出してください:\n\n${content}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AIからの応答をパースできませんでした");
  }

  return JSON.parse(jsonMatch[0]) as TicketData;
}
