// 세계 좌표의 기계점·타겟으로 측량기 입력값(문자열) 생성
const D = Math.PI / 180;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export function dms(deg) {
  deg = ((deg % 360) + 360) % 360;
  let d = Math.floor(deg);
  let m = Math.floor((deg - d) * 60);
  let s = Math.round(((deg - d) * 60 - m) * 60 * 100) / 100;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; d += 1; }
  const [si, sf] = s.toFixed(2).split('.');
  return `${d % 360}.${String(m).padStart(2, '0')}${si.padStart(2, '0')}${sf}`;
}

const SETTINGS = { angleUnit: 'dms', vAngle: 'zenith', tolH: 0.005, tolV: 0.005, axis: 'baseline' };

// st: {x,y,z,hi,az(도), mode?:'polar'|'coord', n0?,e0?,z0?}
// targets: [{name,x,y,z,ht?, only?:'S1'|'S2'}]
export function makeJob({ S1, S2, targets, noise = 0, seed = 7, settings = {} }) {
  const rand = rng(seed);
  const station = (key, st) => {
    const obs = [];
    for (const t of targets) {
      if (t.only && t.only !== key) continue;
      const ht = t.ht ?? 0;
      const dx = t.x - st.x, dy = t.y - st.y;
      const dz = (t.z + ht) - (st.z + (st.hi ?? 0));
      const hd = Math.hypot(dx, dy);
      const sd = Math.hypot(hd, dz) + (noise ? (rand() * 2 - 1) * noise : 0);
      const haDeg = Math.atan2(dx, dy) / D - (st.az ?? 0);
      const zaDeg = Math.atan2(hd, dz) / D;
      const base = { id: `${key}-${t.name}`, name: t.name, sd: '', ha: '', va: '', ht: '', n: '', e: '', z: '' };
      if (st.mode === 'coord') {
        const h = sd * Math.sin(zaDeg * D);
        obs.push({ ...base, mode: 'coord',
          n: ((st.n0 ?? 0) + h * Math.cos(haDeg * D)).toFixed(4),
          e: ((st.e0 ?? 0) + h * Math.sin(haDeg * D)).toFixed(4),
          z: ((st.z0 ?? 0) + sd * Math.cos(zaDeg * D) + (st.hi ?? 0) - ht).toFixed(4) });
      } else {
        obs.push({ ...base, mode: 'polar', sd: sd.toFixed(4), ha: dms(haDeg), va: dms(zaDeg), ht: String(ht) });
      }
    }
    return { hi: String(st.hi ?? ''), n0: String(st.n0 ?? ''), e0: String(st.e0 ?? ''), z0: String(st.z0 ?? ''), obs };
  };
  return {
    id: 'test', name: 'test', createdAt: 0, updatedAt: 0,
    settings: { ...SETTINGS, ...settings },
    stations: { S1: station('S1', S1), S2: station('S2', S2) },
    excluded: [],
  };
}
