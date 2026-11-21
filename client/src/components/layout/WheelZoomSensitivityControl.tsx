import {
  MAX_WHEEL_ZOOM_SENSITIVITY,
  MIN_WHEEL_ZOOM_SENSITIVITY,
  WHEEL_ZOOM_SENSITIVITY_STEP,
} from "@/domain/uiPrefs/uiPrefs";

type WheelZoomSensitivityControlProps = {
  value: number;
  onChange: (value: number) => void;
};

export function formatWheelZoomSensitivityValue(value: number): string {
  return value.toFixed(4);
}

export function WheelZoomSensitivityControl({
  value,
  onChange,
}: WheelZoomSensitivityControlProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <label
        htmlFor="wheel-zoom-sensitivity"
        className="text-sm text-zinc-600 dark:text-zinc-400"
      >
        ズーム感度
      </label>
      <input
        id="wheel-zoom-sensitivity"
        type="range"
        aria-label="ズーム感度"
        min={MIN_WHEEL_ZOOM_SENSITIVITY}
        max={MAX_WHEEL_ZOOM_SENSITIVITY}
        step={WHEEL_ZOOM_SENSITIVITY_STEP}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-28 accent-blue-600"
      />
      <span
        className="min-w-[3.25rem] text-sm tabular-nums text-zinc-600 dark:text-zinc-400"
        aria-live="polite"
      >
        {formatWheelZoomSensitivityValue(value)}
      </span>
    </div>
  );
}