/** Random daily-style math word problems in Tagalog (tips + humor). */
export const TAGALOG_MATH_PROBLEMS: string[] = [
  'Kung may 3 piraso ng pastillas at kinain mo ang isa, ilan ang natitira? Tip: huwag bilangin ang nasa tiyan mo—humor lang, sagot ay 2 (o 0 kung kinain mo lahat sa isang subuan!).',
  'Si Aling Nena ay may 9 na manok. Bumili pa siya ng triple (3). Ilan lahat? Tip: triple sa Swertres, hindi sa sabaw—27? Hindi, 12! 9 + 3 = 12.',
  'May dalawang dice (1-6). Ano ang pinakamataas na sum? Tip: huwag mag-expect ng 13—12 lang ang max (6+6).',
  'Kung ang produkto ng tatlong digit ay 0, ano ang ibig sabihin? Tip: may zero sa loob—parang wallet ko bago sweldo.',
  'Isang 3-digit na numero: bawat digit 0-9. Ilan ang posibleng kombinasyon kung pwede ulit? Tip: 10³ = 1000—parang rason kung bakit “sure ball” ay myth.',
  'May pattern: 2, 4, 8, ? Tip: doblehin mo lang—16. Pero sa lotto, walang guarantee; humor: pattern sa math, hindi sa tadhana.',
  'Kung 1/3 ng cake ang kinain mo at 1/4 ang kinain ng kaibigan mo, ilan ang natitira? Tip: hanapin ang LCD—humor: ang natitira ay guilt at diet plan.',
  'Probability na tama ang isang random 3-digit guess? Tip: 1/1000—mas mataas pa ang chance na magising ka nang maaga sa alarm mo.',
  'May bar ng tsokolate, hatiin sa 5 pantay. Ilan ang guhit? Tip: 4 na hiwa—parang paghahati ng budget, masakit pero matematika.',
  'Kung ang average ng tatlong numero ay 5 at dalawa ay 4 at 6, ano ang pangatlo? Tip: 5 din—symmetry, parang buhay: minsan fair.',
  'Sa isang araw may 3 draws (9AM, 4PM, 9PM). Ilan ang draws sa isang linggo? Tip: 21—pero “swerte” ay hindi linear, sabi ng statistics at ng lolo ko.',
  'Log ng produkto ng 2,3,4? Tip: log(24) ≈ 1.38—ginagamit sa analytics, hindi sa hula ng numero; humor: mas complicated pa sa love life.',
];

export function pickRandomProblem(): string {
  const i = Math.floor(Math.random() * TAGALOG_MATH_PROBLEMS.length);
  return TAGALOG_MATH_PROBLEMS[i];
}
