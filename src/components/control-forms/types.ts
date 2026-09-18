export interface ControlFormProps {
  initialParams: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}
