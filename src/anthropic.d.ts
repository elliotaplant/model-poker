// Written manually, but should be pulled from package
declare module "@anthropic-ai/sdk/resources/messages" {
  export interface ContentBlock {
    type: string;
    [key: string]: any;
  }

  export interface Message {
    id: string;
    model: string;
    content: ContentBlock[];
    [key: string]: any;
  }

  export interface MessageStreamEvent {
    type: string;
    [key: string]: any;
  }

  export interface TextCitation {
    [key: string]: any;
  }

  export interface MessageParam {
    [key: string]: any;
  }

  export interface MessageCreateParams {
    model: string;
    max_tokens: number;
    [key: string]: any;
  }

  export interface MessageCreateParamsBase {
    [key: string]: any;
  }

  export interface Messages {
    create(params: MessageCreateParams): Promise<Message>;
  }

  export default Messages;
}
