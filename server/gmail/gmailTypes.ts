export interface GmailMessageHeader {
  name?: string;
  value?: string;
}

export interface GmailMessagePartBody {
  data?: string;
  size?: number;
  attachmentId?: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  headers?: GmailMessageHeader[];
  body?: GmailMessagePartBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id?: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailMessagePart;
}
