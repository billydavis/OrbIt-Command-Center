import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  MAKAPIX_CHANNELS,
  MAKAPIX_FITS,
  MAKAPIX_SORTS,
  makapixParamsSchema,
  type MakapixChannel,
} from "../../lib/controlSchemas";
import { builtTransitions } from "../../lib/capabilities";
import { TRANSITION_LABELS } from "../../lib/controlLabels";
import { useDeviceStore } from "../../stores/deviceStore";
import { useEmitOnChange } from "./useEmitOnChange";
import type { ControlFormProps } from "./types";

// See TimeForm.tsx for why this uses the schema's input type.
type FormValues = z.input<typeof makapixParamsSchema>;

const CHANNEL_LABELS: Record<MakapixChannel, string> = {
  all: "Everything",
  promoted: "Promoted",
  // Not art stored on the board — posts from the makapix.club account this
  // board is paired with (see the pairing-code hint at the bottom of this
  // form, and "channel" in MakapixControl.h).
  user: "This board's paired account",
  by_user: "A user's posts",
  hashtag: "A hashtag",
  reactions: "A user's reactions",
};

const SORT_LABELS: Record<(typeof MAKAPIX_SORTS)[number], string> = {
  random: "Random",
  server_order: "Newest first",
  created_at: "Oldest first",
};

const FIT_LABELS: Record<(typeof MAKAPIX_FITS)[number], string> = {
  crisp: "Crisp (pixel-perfect, centered on black)",
  fill: "Fill the screen (edges may be trimmed)",
};

// Pixel art from Makapix Club — Orbit Station's own addition to orbit-api
// (see "control" in capabilities.ts), so this form only ever shows for a
// device that reports "makapix" among its built controls.
export function MakapixForm({ initialParams, onChange }: ControlFormProps) {
  const capabilities = useDeviceStore((s) => s.capabilities);
  const transitions = builtTransitions(capabilities);
  const initialTransition =
    typeof initialParams.transition === "string" && transitions.includes(initialParams.transition)
      ? initialParams.transition
      : transitions[0];

  const {
    register,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(makapixParamsSchema),
    defaultValues: {
      channel: (initialParams.channel as MakapixChannel) ?? "all",
      user: typeof initialParams.user === "string" ? initialParams.user : "",
      hashtag: typeof initialParams.hashtag === "string" ? initialParams.hashtag : "",
      sort: (initialParams.sort as (typeof MAKAPIX_SORTS)[number]) ?? "random",
      changeSeconds: typeof initialParams.changeSeconds === "number" ? initialParams.changeSeconds : 120,
      fit: (initialParams.fit as (typeof MAKAPIX_FITS)[number]) ?? "crisp",
      transition: initialTransition,
    },
  });

  const values = watch();
  const needsUser = values.channel === "by_user" || values.channel === "reactions";
  const needsHashtag = values.channel === "hashtag";

  // The device rejects by_user/reactions and hashtag without their field, so
  // leave the whole channel out rather than send a half-filled one.
  const params: Record<string, unknown> = {
    channel: values.channel,
    sort: values.sort,
    changeSeconds: Number.isFinite(values.changeSeconds) ? values.changeSeconds : 120,
    fit: values.fit,
    transition: values.transition,
  };
  if (needsUser && values.user?.trim()) params.user = values.user.trim();
  if (needsHashtag && values.hashtag?.trim()) params.hashtag = values.hashtag.trim();
  useEmitOnChange(params, onChange);

  return (
    <div className="control-form">
      <label className="field">
        Channel
        <select {...register("channel")}>
          {MAKAPIX_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CHANNEL_LABELS[channel]}
            </option>
          ))}
        </select>
      </label>
      {needsUser && (
        <>
          <label className="field">
            User handle
            <input {...register("user")} placeholder="handle" />
          </label>
          {errors.user && <p className="field-error">{errors.user.message}</p>}
          {!values.user?.trim() && <p className="field-hint">Required for this channel.</p>}
        </>
      )}
      {needsHashtag && (
        <>
          <label className="field">
            Hashtag
            <input {...register("hashtag")} placeholder="without the #" />
          </label>
          {!values.hashtag?.trim() && <p className="field-hint">Required for this channel.</p>}
        </>
      )}
      <label className="field">
        Order
        <select {...register("sort")}>
          {MAKAPIX_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Seconds per artwork
        <input type="number" {...register("changeSeconds", { valueAsNumber: true })} />
      </label>
      {errors.changeSeconds && <p className="field-error">{errors.changeSeconds.message}</p>}
      <p className="field-hint">Device clamps this to between 10 seconds and 24 hours.</p>
      <label className="field">
        Fit
        <select {...register("fit")}>
          {MAKAPIX_FITS.map((fit) => (
            <option key={fit} value={fit}>
              {FIT_LABELS[fit]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Transition
        <select {...register("transition")}>
          {transitions.map((transition) => (
            <option key={transition} value={transition}>
              {TRANSITION_LABELS[transition] ?? transition}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint">
        The first screen set to Makapix shows a code to pair the board at makapix.club. No login is
        needed here — the board keeps its own credentials from then on.
      </p>
    </div>
  );
}
