import type { SelectHTMLAttributes } from 'react';
import { SUBURBS } from '@fedsa/contract';
import { useT } from '../i18n/useT';

/** the API places an organisation at its suburb's centroid, so only these suburbs are accepted */
export function SuburbSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const t = useT();
  return (
    <select {...props} className="select">
      <option value="" disabled>
        {t('register.pickSuburb')}
      </option>
      {SUBURBS.map((suburb) => (
        <option key={suburb.name} value={suburb.name}>
          {suburb.name}
        </option>
      ))}
    </select>
  );
}
