declare module 'stream-json' {
  import { Transform } from 'stream';

  interface ParserOptions {
    packValues?: boolean;
    packKeys?: boolean;
    packStrings?: boolean;
    packNumbers?: boolean;
    streamValues?: boolean;
    streamKeys?: boolean;
    streamStrings?: boolean;
    streamNumbers?: boolean;
    jsonStreaming?: boolean;
  }

  export function parser(options?: ParserOptions): Transform;
}
