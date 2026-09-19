export interface ControlFormProps {
  screen: number;
  initialParams: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}
