// Tur yo'nalishlari — davlatlar ro'yxatining YAGONA manbasi.
// Yangi davlat qo'shish uchun faqat shu ro'yxatga bitta qator yozing.
// `name` — bazada saqlanadigan qiymat (tour.country), `flag` — ko'rsatish uchun.
export const tourDestinations = [
  { name: "O'zbekiston",         flag: '🇺🇿' },
  { name: 'Turkiya',             flag: '🇹🇷' },
  { name: 'BAA',                 flag: '🇦🇪' },
  { name: 'Misr',                flag: '🇪🇬' },
  { name: 'Ozarbayjon',          flag: '🇦🇿' },
  { name: 'Gruziya',             flag: '🇬🇪' },
  { name: 'Tailand',             flag: '🇹🇭' },
  { name: 'Maldiv orollari',     flag: '🇲🇻' },
  { name: 'Malayziya',           flag: '🇲🇾' },
  { name: 'Indoneziya',          flag: '🇮🇩' },
  { name: 'Vetnam',              flag: '🇻🇳' },
  { name: 'Xitoy',               flag: '🇨🇳' },
  { name: 'Yaponiya',            flag: '🇯🇵' },
  { name: 'Janubiy Koreya',      flag: '🇰🇷' },
  { name: 'Hindiston',           flag: '🇮🇳' },
  { name: 'Shri-Lanka',          flag: '🇱🇰' },
  { name: 'Qatar',               flag: '🇶🇦' },
  { name: 'Saudiya Arabistoni',  flag: '🇸🇦' },
  { name: 'Ummon',               flag: '🇴🇲' },
  { name: 'Italiya',             flag: '🇮🇹' },
  { name: 'Fransiya',            flag: '🇫🇷' },
  { name: 'Ispaniya',            flag: '🇪🇸' },
  { name: 'Gretsiya',            flag: '🇬🇷' },
  { name: 'Germaniya',           flag: '🇩🇪' },
  { name: 'Chexiya',             flag: '🇨🇿' },
  { name: 'Vengriya',            flag: '🇭🇺' },
  { name: 'Avstriya',            flag: '🇦🇹' },
  { name: 'Shveytsariya',        flag: '🇨🇭' },
  { name: 'Niderlandiya',        flag: '🇳🇱' },
  { name: 'Buyuk Britaniya',     flag: '🇬🇧' },
  { name: 'Chernogoriya',        flag: '🇲🇪' },
  { name: 'Albaniya',            flag: '🇦🇱' }
]

/** Davlat nomi → bayroq. */
export const destinationFlags = Object.fromEntries(tourDestinations.map((d) => [d.name, d.flag]))

// Tur turlari: doimiy — har doim sotuvda; muddatli — aniq sanalar oralig'ida.
export const TOUR_TYPES = [
  { value: 'Doimiy',   label: 'Doimiy tur' },
  { value: 'Muddatli', label: 'Muddatli tur' }
]
