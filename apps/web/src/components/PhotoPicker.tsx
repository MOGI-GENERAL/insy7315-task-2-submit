/* PHOTO PICKER: camera-roll style radio grid, stands in for device camera */

import { FoodPhoto } from './FoodPhoto';
import { photoKeys, photoLabels } from './photoKeys';
import { Icon } from './Icon';

export function PhotoPicker({
  value,
  onChange,
  label,
  hint,
  name = 'photo',
}: {
  value: string | null;
  onChange: (photo: string | null) => void;
  label: string;
  hint?: string;
  name?: string;
}) {
  return (
    <fieldset className="photo-picker">
      <legend className="field__label">
        <Icon name="camera" size={16} /> {label}
      </legend>
      {hint && <p className="field__hint">{hint}</p>}
      <div className="photo-picker__grid">
        {photoKeys.map((key) => (
          <label key={key} className="photo-picker__option">
            <input
              type="radio"
              name={name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
            />
            <span className="photo-picker__frame">
              <FoodPhoto photo={key} />
              <span className="photo-picker__caption">{photoLabels[key]}</span>
              <span className="photo-picker__tick" aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
