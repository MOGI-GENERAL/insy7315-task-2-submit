/** wa.me wants the number as bare digits, without the plus */
export function whatsAppLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/** no address, because drivers have no email on the platform */
export function emailLink(subject: string, body: string) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
