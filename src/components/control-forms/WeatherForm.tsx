import { useState } from "react";
import { useForm } from "react-hook-form";
import { ColorInput } from "../shared/ColorInput";
import { colorParam, COLORS } from "../../lib/rgb565";
import { WEATHER_LOCATION_MAX_LENGTH, type WeatherParams } from "../../lib/controlSchemas";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

type WeatherElement = WeatherParams["element"];
type ColorKey = "color" | "background" | "highColor" | "lowColor" | "cityColor";

const COLOR_KEYS: ColorKey[] = ["color", "background", "highColor", "lowColor", "cityColor"];

const COLOR_LABELS: Record<ColorKey, string> = {
  color: "Text",
  background: "Background",
  highColor: "High",
  lowColor: "Low",
  cityColor: "City name",
};

interface FormValues {
  element: WeatherElement;
  location: string;
  showCity: boolean;
  showHighLow: boolean;
  custom: Record<ColorKey, boolean>;
  colors: Record<ColorKey, number>;
}

// The device reports `location` and each color only when one was set, and
// `showHighLow`/`showCity` only for "temperature" (see "weather control" in
// docs/orbit-api.md), so the params emitted here leave them out the same
// way — otherwise a screen nobody has touched would read as dirty straight
// after connecting.
export function WeatherForm({ initialParams, onChange }: ControlFormProps) {
  const reported = (key: string) => typeof initialParams[key] === "boolean";
  const initialLocation = typeof initialParams.location === "string" ? initialParams.location : "";
  // An unset color draws as the main text color (white, or black on an orb
  // built in Light mode), so that's where its picker starts from.
  const text = colorParam(initialParams.color, COLORS.white);
  const { register, setValue, watch } = useForm<FormValues>({
    defaultValues: {
      element: (initialParams.element as WeatherElement) ?? "icon",
      location: initialLocation,
      showCity: reported("showCity") ? Boolean(initialParams.showCity) : initialLocation !== "",
      showHighLow: initialParams.showHighLow !== false,
      custom: Object.fromEntries(
        COLOR_KEYS.map((key) => [key, typeof initialParams[key] === "number"]),
      ) as Record<ColorKey, boolean>,
      colors: {
        color: text,
        background: colorParam(initialParams.background, COLORS.black),
        highColor: colorParam(initialParams.highColor, text),
        lowColor: colorParam(initialParams.lowColor, text),
        cityColor: colorParam(initialParams.cityColor, text),
      },
    },
  });

  // Until the city name is chosen either way it follows the location, as
  // the device does when `showCity` is left out: on for a location given
  // here, off for the orb's own.
  const [cityChosen, setCityChosen] = useState(reported("showCity"));

  const values = watch();
  const location = values.location.trim();
  const params: WeatherParams = { element: values.element };
  if (location) params.location = location;
  if (values.element === "temperature") {
    // Firmware from before these options doesn't report them; leaving out
    // what's still at its default keeps such a screen from reading as dirty.
    if (reported("showHighLow") || !values.showHighLow) params.showHighLow = values.showHighLow;
    if (cityChosen) params.showCity = values.showCity;
  }
  // Colors the chosen element doesn't draw are sent all the same: the device
  // keeps them, so switching element and back doesn't lose them.
  for (const key of COLOR_KEYS) {
    if (values.custom[key]) params[key] = values.colors[key];
  }
  useEmitOnChange(params, onChange);

  const colorKeys: ColorKey[] =
    values.element === "icon"
      ? []
      : values.element === "condition"
        ? ["color", "background", "cityColor"]
        : [
            "color",
            "background",
            ...(values.showHighLow ? (["highColor", "lowColor"] as const) : []),
            ...(values.showCity ? (["cityColor"] as const) : []),
          ];

  return (
    <div className="control-form">
      <label className="field">
        Element
        <select {...register("element")}>
          <option value="icon">Icon</option>
          <option value="temperature">Temperature</option>
          <option value="condition">Condition</option>
        </select>
      </label>
      <label className="field">
        Location
        <input
          {...register("location", {
            onChange: (e) => {
              if (!cityChosen) setValue("showCity", e.target.value.trim() !== "");
            },
          })}
          maxLength={WEATHER_LOCATION_MAX_LENGTH}
          placeholder="The orb's own location"
        />
      </label>
      <p className="field-hint">
        A city, a postal code or "lat,lon". Leave it empty to use the location set in the orb's
        firmware. Each different location is its own weather request every 10 minutes, and one the
        weather service can't find shows 0° until it's corrected.
      </p>
      {values.element === "temperature" && (
        <>
          <label className="field-checkbox">
            <input type="checkbox" {...register("showHighLow")} /> Show today's high and low
          </label>
          <label className="field-checkbox">
            <input type="checkbox" {...register("showCity", { onChange: () => setCityChosen(true) })} />{" "}
            Show city name
          </label>
        </>
      )}
      {values.element === "icon" ? (
        <p className="field-hint">The icon fills the screen, so it has no colors to set.</p>
      ) : (
        <p className="field-hint">Colors left unticked use the orb's own.</p>
      )}
      {colorKeys.map((key) => (
        <div key={key} className="control-form">
          <label className="field-checkbox">
            <input type="checkbox" {...register(`custom.${key}`)} /> Custom{" "}
            {COLOR_LABELS[key].toLowerCase()} color
          </label>
          {values.custom[key] && (
            <ColorInput
              id={`weather-${key}`}
              label={COLOR_LABELS[key]}
              value={values.colors[key]}
              onChange={(v) => setValue(`colors.${key}`, v)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
