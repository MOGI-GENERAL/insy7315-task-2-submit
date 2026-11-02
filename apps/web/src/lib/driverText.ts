const saTime = new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** South African time, as the SMS writes it */
export const formatSaWhen = (iso: string) => saTime.format(new Date(iso));

/** the driver text follows the SMS, which is always in English */
export interface DriverTextParts {
  reference: string;
  /** ISO date-time */
  deadline: string;
  pickupAddress: string;
  contactName: string;
  contactPhone: string;
  dropOffAddress: string;
  link: string;
}

export function driverText(p: DriverTextParts) {
  const deadline = formatSaWhen(p.deadline);
  return `FEDSA: Collection ${p.reference}. Collect from ${p.pickupAddress} (${p.contactName}, ${p.contactPhone}) by ${deadline}. Deliver to ${p.dropOffAddress}. Details: ${p.link}`;
}
