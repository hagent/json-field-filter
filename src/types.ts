export interface FieldInfo {
  name: string;
  hidden: boolean; // true if field should be filtered out
  isComplex: boolean; // true if field contains object or array
}

export interface Preset {
  name: string;
  fields: string[];
}

export type MessageToWebview =
  | { type: 'updateFields'; fields: FieldInfo[] }
  | { type: 'setLoading'; isLoading: boolean }
  | { type: 'setError'; error: string | null }
  | { type: 'setSourceUri'; uri: string | null }
  | { type: 'setPresets'; presets: Preset[] };

export type MessageFromWebview =
  | { type: 'toggleField'; fieldName: string; hidden: boolean }
  | { type: 'openFilteredView' }
  | { type: 'extractFields' }
  | { type: 'applyPreset'; presetName: string }
  | { type: 'ready' };
