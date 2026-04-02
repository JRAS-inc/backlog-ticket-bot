import { TicketData } from "./ai";

const BACKLOG_BASE_URL = `https://${process.env.BACKLOG_SPACE_ID}.backlog.com/api/v2`;
const API_KEY = process.env.BACKLOG_API_KEY!;
const PROJECT_ID = process.env.BACKLOG_PROJECT_ID!;
const DEFAULT_ISSUE_TYPE_ID = process.env.BACKLOG_ISSUE_TYPE_ID || "4071592";

interface BacklogIssue {
  id: number;
  issueKey: string;
  summary: string;
}

export async function createIssue(
  ticket: TicketData,
  sourceInfo: string
): Promise<BacklogIssue> {
  const description = `${ticket.description}\n\n---\n起票元: ${sourceInfo}`;

  const params = new URLSearchParams({
    apiKey: API_KEY,
    projectId: PROJECT_ID,
    summary: ticket.summary,
    issueTypeId: String(ticket.issueTypeId || DEFAULT_ISSUE_TYPE_ID),
    priorityId: String(ticket.priorityId),
    description,
  });

  const res = await fetch(`${BACKLOG_BASE_URL}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Backlog API error (${res.status}): ${error}`);
  }

  return (await res.json()) as BacklogIssue;
}
