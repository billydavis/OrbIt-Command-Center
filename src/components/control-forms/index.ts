import type { ComponentType } from "react";
import type { ControlType } from "../../lib/types";
import type { ControlFormProps } from "./types";
import { BlankForm } from "./BlankForm";
import { TimeForm } from "./TimeForm";
import { AnalogClockForm } from "./AnalogClockForm";
import { GaugeForm } from "./GaugeForm";
import { SysMonitorForm } from "./SysMonitorForm";
import { WeatherForm } from "./WeatherForm";
import { TickerForm } from "./TickerForm";
import { CustomForm } from "./CustomForm";
import { ScreensaverForm } from "./ScreensaverForm";

// countdown is intentionally not in this registry — it doesn't follow the
// "edit params, apply as part of the bulk layout" pattern every other
// control does (see CountdownForm.tsx and the "excluded from bulk Apply"
// plan decision). ScreenEditor special-cases it.
export const CONTROL_FORMS: Record<Exclude<ControlType, "countdown">, ComponentType<ControlFormProps>> = {
  blank: BlankForm,
  time: TimeForm,
  analogClock: AnalogClockForm,
  gauge: GaugeForm,
  sysMonitor: SysMonitorForm,
  weather: WeatherForm,
  ticker: TickerForm,
  custom: CustomForm,
  screensaver: ScreensaverForm,
};
