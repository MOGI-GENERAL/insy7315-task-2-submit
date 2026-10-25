import type { Language, NotificationKind, Offer } from '@fedsa/contract';

// the Afrikaans and isiXhosa text still needs a first-language speaker's review

export interface OfferDetails {
  reference: string;
  quantityKg: number;
  suburb: string;
  /** ISO date-time */
  deadline: string;
}

/** what each kind of notification needs to fill its text */
export interface MessageData {
  offer_posted: OfferDetails;
  /** without `claimedBy` it tells other recipients the offer is gone */
  offer_claimed: OfferDetails & { claimedBy?: string };
  claim_released: OfferDetails & { releasedBy: string };
  handover_confirmed: { reference: string; quantityKg: number };
  driver_dispatched: {
    reference: string;
    pickupAddress: string;
    contactName: string;
    contactPhone: string;
    deadline: string;
    dropOffAddress: string;
  };
  verification: { organisationName: string };
  dispute: { reference: string; organisationName: string };
  /** both dates are ISO date-times */
  certificate_issued: { certificateNumber: string; periodStart: string; periodEnd: string };
}

export interface RenderedMessage {
  title: string;
  body: string;
  /** SMS and WhatsApp have no separate title, and offers add the reply that claims them */
  phoneText: string;
}

interface Format {
  kg(quantity: number): string;
  time(iso: string): string;
  day(iso: string): string;
}

type Template<D> = (data: D, f: Format) => { title: string; body: string; reply?: string };
type Templates = { [K in NotificationKind]: Template<MessageData[K]> };

const LOCALE: Record<Language, string> = { en: 'en-ZA', af: 'af-ZA', xh: 'xh-ZA' };

// there is no reviewed Afrikaans or isiXhosa text yet. every language gets the English
const certificateIssued: Template<MessageData['certificate_issued']> = (d, f) => ({
  title: `Tax certificate ${d.certificateNumber}`,
  body: `Your tax certificate for ${f.day(d.periodStart)} to ${f.day(d.periodEnd)} is ready to download under Certificates.`,
});

/** the reply keyword stays YES in every language, so one rule parses every reply */
const TEMPLATES: Record<Language, Templates> = {
  en: {
    offer_posted: (d, f) => ({
      title: `New offer ${d.reference}`,
      body: `${f.kg(d.quantityKg)} in ${d.suburb}. Collect by ${f.time(d.deadline)}.`,
      reply: `Reply YES ${d.reference} to claim.`,
    }),
    offer_claimed: (d, f) =>
      d.claimedBy
        ? {
            title: `Offer ${d.reference} claimed`,
            body: `${d.claimedBy} claimed ${f.kg(d.quantityKg)}. Collection is by ${f.time(d.deadline)}.`,
          }
        : {
            title: `Offer ${d.reference} taken`,
            body: 'This offer has been claimed and is no longer available.',
          },
    claim_released: (d, f) => ({
      title: `Offer ${d.reference} released`,
      body: `${d.releasedBy} released the claim. The offer is open to other organisations until ${f.time(d.deadline)}.`,
    }),
    handover_confirmed: (d, f) => ({
      title: 'Handover confirmed',
      body: `Both sides confirmed the handover of ${f.kg(d.quantityKg)} for offer ${d.reference}.`,
    }),
    driver_dispatched: (d, f) => ({
      title: `Collection ${d.reference}`,
      body: `Collect from ${d.pickupAddress} (${d.contactName}, ${d.contactPhone}) by ${f.time(d.deadline)}. Deliver to ${d.dropOffAddress}.`,
    }),
    verification: (d) => ({
      title: 'Verification update',
      body: `The verification status of ${d.organisationName} has changed. Sign in to FEDSA to see it.`,
    }),
    dispute: (d) => ({
      title: 'Problem reported',
      body: `${d.organisationName} reported a problem with the handover for offer ${d.reference}.`,
    }),
    certificate_issued: certificateIssued,
  },
  af: {
    offer_posted: (d, f) => ({
      title: `Nuwe aanbod ${d.reference}`,
      body: `${f.kg(d.quantityKg)} in ${d.suburb}. Haal teen ${f.time(d.deadline)} af.`,
      reply: `Antwoord YES ${d.reference} om dit te eis.`,
    }),
    offer_claimed: (d, f) =>
      d.claimedBy
        ? {
            title: `Aanbod ${d.reference} geëis`,
            body: `${d.claimedBy} het ${f.kg(d.quantityKg)} geëis. Afhaal is teen ${f.time(d.deadline)}.`,
          }
        : {
            title: `Aanbod ${d.reference} is weg`,
            body: 'Hierdie aanbod is reeds geëis en is nie meer beskikbaar nie.',
          },
    claim_released: (d, f) => ({
      title: `Aanbod ${d.reference} vrygestel`,
      body: `${d.releasedBy} het die eis vrygestel. Die aanbod is oop vir ander organisasies tot ${f.time(d.deadline)}.`,
    }),
    handover_confirmed: (d, f) => ({
      title: 'Oorhandiging bevestig',
      body: `Albei kante het die oorhandiging van ${f.kg(d.quantityKg)} vir aanbod ${d.reference} bevestig.`,
    }),
    driver_dispatched: (d, f) => ({
      title: `Afhaling ${d.reference}`,
      body: `Haal af by ${d.pickupAddress} (${d.contactName}, ${d.contactPhone}) teen ${f.time(d.deadline)}. Lewer af by ${d.dropOffAddress}.`,
    }),
    verification: (d) => ({
      title: 'Verifikasie-opdatering',
      body: `Die verifikasiestatus van ${d.organisationName} het verander. Meld aan by FEDSA om dit te sien.`,
    }),
    dispute: (d) => ({
      title: 'Probleem aangemeld',
      body: `${d.organisationName} het 'n probleem met die oorhandiging van aanbod ${d.reference} aangemeld.`,
    }),
    certificate_issued: (d) => certificateIssued(d, formatFor('en')),
  },
  xh: {
    offer_posted: (d, f) => ({
      title: `Isibonelelo esitsha ${d.reference}`,
      body: `${f.kg(d.quantityKg)}, ${d.suburb}. Ixesha lokugqibela lokuthatha: ${f.time(d.deadline)}.`,
      reply: `Phendula u-YES ${d.reference} ukuze usibange.`,
    }),
    offer_claimed: (d, f) =>
      d.claimedBy
        ? {
            title: `Isibonelelo ${d.reference} sibangiwe`,
            body: `${d.claimedBy} ibange i-${f.kg(d.quantityKg)}. Ixesha lokugqibela lokuthatha: ${f.time(d.deadline)}.`,
          }
        : {
            title: `Isibonelelo ${d.reference} sithathiwe`,
            body: 'Esi sibonelelo sele sibangiwe kwaye asisafumaneki.',
          },
    claim_released: (d, f) => ({
      title: `Isibonelelo ${d.reference} sikhululiwe`,
      body: `${d.releasedBy} ikhulule ibango. Isibonelelo sivulekile kwakhona kweminye imibutho de kube ngu-${f.time(d.deadline)}.`,
    }),
    handover_confirmed: (d, f) => ({
      title: 'Ukunikezelwa kuqinisekisiwe',
      body: `Omabini amacala aqinisekisile ukunikezelwa kwe-${f.kg(d.quantityKg)} kwisibonelelo ${d.reference}.`,
    }),
    driver_dispatched: (d, f) => ({
      title: `Ukuthatha ${d.reference}`,
      body: `Dilesi yokuthatha: ${d.pickupAddress} (${d.contactName}, ${d.contactPhone}). Ixesha lokugqibela: ${f.time(d.deadline)}. Dilesi yokuhambisa: ${d.dropOffAddress}.`,
    }),
    verification: (d) => ({
      title: 'Uhlaziyo lokuqinisekiswa',
      body: `Imeko yokuqinisekiswa ka-${d.organisationName} itshintshile. Ngena kwi-FEDSA ukuze uyibone.`,
    }),
    dispute: (d) => ({
      title: 'Kuxelwe ingxaki',
      body: `${d.organisationName} ixele ingxaki ngokunikezelwa kwesibonelelo ${d.reference}.`,
    }),
    certificate_issued: (d) => certificateIssued(d, formatFor('en')),
  },
};

/** the answer to a text or WhatsApp reply that tries to claim an offer */
export type ClaimReplyKind = 'claimed' | 'unavailable' | 'not_understood';

export interface ClaimReplyData {
  claimed: {
    reference: string;
    pickupAddress: string;
    contactName: string;
    contactPhone: string;
    deadline: string;
  };
  /** one answer whether taken, unknown or not eligible. a reply cannot probe for offers */
  unavailable: { reference: string };
  not_understood: Record<string, never>;
}

type Reply<D> = (data: D, f: Format) => string;
type Replies = { [K in ClaimReplyKind]: Reply<ClaimReplyData[K]> };

const REPLIES: Record<Language, Replies> = {
  en: {
    claimed: (d, f) =>
      `You have claimed offer ${d.reference}. Collect from ${d.pickupAddress} by ${f.time(d.deadline)}. Contact ${d.contactName} on ${d.contactPhone}.`,
    unavailable: (d) =>
      `Offer ${d.reference} has already been claimed or is not available to your organisation.`,
    not_understood: () =>
      'To claim an offer, reply YES followed by the reference in the offer message.',
  },
  af: {
    claimed: (d, f) =>
      `Julle het aanbod ${d.reference} geëis. Haal by ${d.pickupAddress} af teen ${f.time(d.deadline)}. Kontak ${d.contactName} by ${d.contactPhone}.`,
    unavailable: (d) =>
      `Aanbod ${d.reference} is reeds geëis of is nie vir julle organisasie beskikbaar nie.`,
    not_understood: () =>
      "Om 'n aanbod te eis, antwoord YES gevolg deur die verwysing in die aanbodboodskap.",
  },
  xh: {
    claimed: (d, f) =>
      `Nibange isibonelelo ${d.reference}. Dilesi yokuthatha: ${d.pickupAddress}. Ixesha lokugqibela lokuthatha: ${f.time(d.deadline)}. Qhagamshelana no-${d.contactName} ku-${d.contactPhone}.`,
    unavailable: (d) =>
      `Isibonelelo ${d.reference} sele sibangiwe okanye asifumaneki kumbutho wenu.`,
    not_understood: () =>
      'Ukubanga isibonelelo, phendula u-YES kunye nesalathiso esikumyalezo wesibonelelo.',
  },
};

/** in English, because nothing is known about the sender, their language included */
export const UNKNOWN_SENDER_REPLY =
  'FEDSA: We could not act on this message. Use the FEDSA app to claim offers.';

function formatFor(language: Language): Format {
  const locale = LOCALE[language];
  const quantity = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  // deadlines are read in Cape Town, whatever time zone the server runs in
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Johannesburg',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: 'Africa/Johannesburg',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return {
    kg: (n) => `${quantity.format(n)} kg`,
    time: (iso) => time.format(new Date(iso)),
    day: (iso) => day.format(new Date(iso)),
  };
}

export function renderMessage<K extends NotificationKind>(
  kind: K,
  language: Language,
  data: MessageData[K],
): RenderedMessage {
  const template: Template<MessageData[K]> = TEMPLATES[language][kind];
  const { title, body, reply } = template(data, formatFor(language));
  const phoneText = `FEDSA: ${title}. ${body}${reply ? ` ${reply}` : ''}`;
  return { title, body, phoneText };
}

export function renderReply<K extends ClaimReplyKind>(
  kind: K,
  language: Language,
  data: ClaimReplyData[K],
): string {
  const reply: Reply<ClaimReplyData[K]> = REPLIES[language][kind];
  return `FEDSA: ${reply(data, formatFor(language))}`;
}

export function offerDetails(offer: Offer): OfferDetails {
  return {
    reference: offer.reference,
    quantityKg: offer.offeredQuantityKg,
    suburb: offer.donor.suburb,
    deadline: offer.collectionDeadline,
  };
}
