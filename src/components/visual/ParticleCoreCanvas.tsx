import { useEffect, useRef } from 'react';
import type { KiraSettings } from '../../types/settings';
import type { VoiceMode } from '../../types/voice';

type ParticleCoreCanvasProps = {
  mode?: VoiceMode;
  amplitude?: number;
  performanceMode?: KiraSettings['performanceMode'];
};

// ── Kira — presenza divina digitale (v6: figura vera IN 3D + aura) ──────────
// Riferimento: immagine in public/kira-figure.jpg.
// La figura è la VERA immagine — "così com'è è già carina, basterebbe
// farla 3D e darle movimenti". Quindi: depth map reale (Depth Anything V2,
// generata offline in public/kira-figure-depth.png) campionata nel vertex
// shader su una griglia densa → rilievo vero, parallasse prospettica che segue
// il cursore (stessa proiezione dell'aura: spazio 3D coerente), respiro in
// profondità, luce di rilievo dalle normali della depth. Sopra restano tutti
// i movimenti v5: scheletro 2D (capo/braccia), blink a copertura, labiale,
// velo fluente, solletico, planate. Intorno: aura di particelle, pioggia
// binaria dietro, cubi digitali dell'halo davanti.

const FIGURE_SRC = '/kira-figure.jpg';
const DEPTH_SRC = '/kira-figure-depth.png';
// griglia del rilievo: abbastanza densa per il viso, irrisoria per la GPU
const SEG_X = 128;
const SEG_Y = 160;

// mappatura immagine → mondo: la figura sta in y [TOP_Y - FIG_H, TOP_Y]
const TOP_Y = 0.88;
const FIG_H = 1.78;
// occhi in UV — misurati con marker a 6x sui CENTRI IRIDE (sono ad altezze
// diverse: il capo nell'artwork è leggermente inclinato). Fallback per la
// detection automatica.
const EYE_UV: Array<[number, number]> = [[0.4646, 0.2074], [0.5345, 0.1968]];
const MOUTH_UV: [number, number] = [0.5065, 0.2475];

type StateTuning = {
  tint: [number, number, number];   // velatura colore di stato (quasi neutra)
  glow: number;                     // luminosità complessiva
  flow: number;                     // velocità di capelli/veli/circuiti
  calm: number;                     // 1 = movimenti minimi
  lid: number;                      // palpebre: 0 = spalancati, 1 = socchiusi
  lean: number;                     // protendersi verso l'osservatore
};

const STATES: Record<string, StateTuning> = {
  idle:      { tint: [0.82, 0.89, 1.00], glow: 0.66, flow: 0.45, calm: 1.00, lid: 0.12, lean: 0.0 },
  listening: { tint: [0.92, 0.90, 1.00], glow: 0.78, flow: 0.60, calm: 0.72, lid: 0.00, lean: 1.0 },
  thinking:  { tint: [0.74, 0.84, 1.00], glow: 0.70, flow: 0.90, calm: 0.55, lid: 0.42, lean: -0.3 },
  speaking:  { tint: [0.98, 0.97, 1.00], glow: 0.95, flow: 1.05, calm: 0.40, lid: 0.06, lean: 0.7 },
  executing: { tint: [0.74, 0.94, 1.00], glow: 0.85, flow: 1.30, calm: 0.45, lid: 0.20, lean: 0.3 },
  error:     { tint: [1.00, 0.66, 0.66], glow: 0.85, flow: 1.40, calm: 0.30, lid: 0.10, lean: -0.4 },
  // ── stati estesi (2.5D, solo modulazione luce/flusso/palpebre/lean — niente volume/rotazione) ──
  sleep:     { tint: [0.70, 0.80, 1.00], glow: 0.30, flow: 0.18, calm: 1.00, lid: 0.95, lean: -0.5 }, // assopita, occhi quasi chiusi, fioca
  update:    { tint: [0.72, 0.95, 1.00], glow: 0.82, flow: 1.45, calm: 0.50, lid: 0.22, lean: 0.2 },  // sta lavorando: flusso intenso ciano
  alert:     { tint: [1.00, 0.90, 0.82], glow: 1.00, flow: 1.15, calm: 0.22, lid: 0.00, lean: 1.2 },  // attenzione: protesa, occhi spalancati, calda
  briefing:  { tint: [1.00, 0.96, 0.92], glow: 0.88, flow: 0.82, calm: 0.55, lid: 0.05, lean: 0.6 },  // racconta: presente, calda, sguardo aperto
};

function stateFor(mode: VoiceMode): StateTuning {
  return STATES[mode] ?? STATES.idle;
}

// ── Shader della FIGURA (quad texturizzato) ──────────────────────────────────

const FIG_VERTEX = `#version 300 es
precision highp float;
in vec2 a_uv;
uniform sampler2D u_tex;     // alpha = maschera figura (neutralizza il rilievo ai bordi)
uniform sampler2D u_depth;   // depth map reale: bianco = vicino alla camera
uniform float u_time;
uniform float u_aspect;
uniform float u_fit;
uniform float u_swayRot;
uniform float u_lean;
uniform float u_figW;
uniform vec2  u_fly;     // planata verso il widget appena aperto
uniform float u_look;    // parallasse 3D orizzontale verso il cursore
uniform float u_lookY;   // parallasse 3D verticale verso il cursore
uniform float u_headTilt;
uniform float u_armL;
out vec2 v_uv;
out float v_z;

vec2 rotAround(vec2 uv, vec2 P, float a, float R) {
  vec2 d = uv - P;
  float m = smoothstep(R, R * 0.25, length(d));
  float aa = a * m;
  float s = sin(aa), c = cos(aa);
  return P + mat2(c, -s, s, c) * d;
}

void main() {
  v_uv = a_uv;

  // il rilievo segue i gesti: stessa rotazione scheletrica del color pass
  // (solo i warp a bassa frequenza — quelli fini non spostano la profondità)
  vec2 duv = rotAround(a_uv, vec2(0.508, 0.285), u_headTilt, 0.155);
  duv = clamp(rotAround(duv, vec2(0.617, 0.431), u_armL, 0.18), 0.0, 1.0);
  float d = texture(u_depth, duv).r;
  float mask = texture(u_tex, duv).a;
  // fuori figura la depth va su un piano neutro: i triangoli a cavallo del
  // bordo non si strappano (niente "tenda" alle silhouette)
  d = mix(0.42, d, smoothstep(0.04, 0.45, mask));
  float z = (0.45 - d) * 0.40;                       // front = -z come l'aura
  z *= 1.0 + 0.045 * sin(u_time * 1.05);             // respiro in profondità

  vec2 pos = vec2((a_uv.x - 0.5) * u_figW, ${TOP_Y.toFixed(2)} - a_uv.y * ${FIG_H.toFixed(2)});
  pos.y += 0.005 * sin(u_time * 1.05) * smoothstep(-0.3, 0.45, pos.y);   // respiro
  float s = sin(u_swayRot), c = cos(u_swayRot);
  pos = mat2(c, -s, s, c) * pos;
  pos.y += sin(u_time * 0.23) * 0.006 - u_lean * smoothstep(-0.2, 0.6, pos.y) * 0.035;

  // ── 3D: identica parallasse dell'aura (stesso spazio) + pitch dal cursore
  float parallax = sin(u_time * 0.12) * 0.5 + sin(u_time * 0.047) * 0.3;
  pos.x += z * (parallax * 0.12 + u_look * 0.55);
  pos.y += z * (u_lookY * 0.30 - 0.05);
  pos += u_fly;

  float persp = 1.35 / (1.35 + z * 0.9);             // stessa proiezione dei punti
  vec2 screen = vec2(pos.x * persp / u_aspect, pos.y * persp) * 1.04 * u_fit;
  gl_Position = vec4(screen, z * 0.1, 1.0);
  v_z = z;
}`;

const FIG_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_z;
uniform sampler2D u_tex;
uniform sampler2D u_depth;
uniform float u_look;
uniform float u_lookY;
uniform float u_time;
uniform float u_glow;
uniform float u_flow;
uniform float u_calm;
uniform float u_lid;     // stato pensierosa: occhi socchiusi
uniform float u_amplitude;
uniform float u_pulse;
uniform vec3  u_tint;
uniform vec2  u_eyeL;    // occhi VERI rilevati dai pixel dell'iride
uniform vec2  u_eyeR;
uniform vec2  u_mouth;
uniform vec2  u_mouse;   // cursore in UV figura
uniform float u_tickle;  // "solletico": cresce con la velocità del mouse
uniform float u_speak;   // energia di parola (voce o chat), già articolata lato JS
uniform float u_blink;   // battito di ciglia naturale, 0 aperti → 1 chiusi
uniform float u_headTilt;
uniform float u_armL;    // rotazione avambraccio alzato (gesto)
uniform float u_armR;    // mano sul petto: pressione delicata
out vec4 outColor;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// warp "scheletrico": ruota una regione attorno a un perno con falloff morbido —
// è ciò che trasforma l'immagine in una marionetta viva (capo, avambracci)
vec2 rotAround(vec2 uv, vec2 P, float a, float R) {
  vec2 d = uv - P;
  float m = smoothstep(R, R * 0.25, length(d));
  float aa = a * m;
  float s = sin(aa), c = cos(aa);
  return P + mat2(c, -s, s, c) * d;
}

void main() {
  vec2 uv = v_uv;

  // ── scheletro 2D: gesti umani (perni MISURATI sull'anatomia vera) ──────────
  uv = rotAround(uv, vec2(0.508, 0.285), u_headTilt, 0.155);   // capo, perno al collo
  uv = rotAround(uv, vec2(0.617, 0.431), u_armL, 0.18);        // avambraccio alzato, perno al GOMITO vero
  vec2 dR = uv - vec2(0.458, 0.313);
  float mR = smoothstep(0.075, 0.018, length(dR));
  uv += vec2(0.005, 0.009) * u_armR * mR;                      // mano al petto: carezza delicata

  // velo vivo: capelli e orli ondeggiano, il volto resta perfettamente fermo
  float du = abs(uv.x - 0.5);
  float flowM = (uv.y < 0.30 && du < 0.105)
    ? 0.04
    : clamp(0.16 + du * 1.6 + max(0.0, uv.y - 0.45) * 1.0, 0.0, 1.0);
  float fl = flowM * (1.0 - 0.45 * u_calm);
  uv.x += sin(uv.y * 22.0 - u_time * (0.6 + u_flow * 0.9)) * 0.0035 * fl;
  uv.y += cos(uv.x * 18.0 + u_time * 0.5) * 0.0022 * fl;
  uv.x += sin(uv.y * 7.0 - u_time * 4.5) * u_amplitude * 0.004 * flowM;

  // dita: micro vibrazione elegante sulle due mani (anchor sulle mani VERE)
  float dH = min(distance(uv, vec2(0.458, 0.313)), distance(uv, vec2(0.687, 0.342)));
  float handK = smoothstep(0.050, 0.012, dH);
  uv += vec2(sin(u_time * 1.7 + uv.y * 70.0), cos(u_time * 1.4 + uv.x * 70.0)) * 0.0018 * handK * (0.4 + 0.6 * u_flow);

  // solletico del cursore: increspatura giocosa che la fa fremere
  float dM = distance(uv, u_mouse);
  float tick = u_tickle * smoothstep(0.17, 0.02, dM);
  uv += vec2(sin(uv.y * 95.0 + u_time * 14.0), cos(uv.x * 95.0 + u_time * 12.0)) * 0.0035 * tick * max(flowM, 0.3);

  // ── bocca: la mascella scende e articola mentre parla o scrive — SOTTILE,
  //    solo la zona sotto il labbro, mai il mento intero
  vec2 dJ = uv - u_mouth;
  float jawMask = smoothstep(0.040, 0.010, length(dJ * vec2(1.35, 1.0))) * smoothstep(-0.004, 0.008, dJ.y);
  uv.y -= u_speak * jawMask * 0.0055;

  vec4 tex = texture(u_tex, uv);
  if (tex.a < 0.02) discard;
  vec3 col = tex.rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  // ── rilievo 3D: normale dalla depth map, luce fredda che segue il cursore —
  //    il volume si LEGGE anche da ferma, e ruotando lo sguardo cambia l'ombra
  vec2 de = vec2(0.0045);
  float dX = texture(u_depth, uv + vec2(de.x, 0.0)).r - texture(u_depth, uv - vec2(de.x, 0.0)).r;
  float dY = texture(u_depth, uv + vec2(0.0, de.y)).r - texture(u_depth, uv - vec2(0.0, de.y)).r;
  vec3 nrm = normalize(vec3(-dX * 2.0, dY * 2.0, 1.0));
  vec3 Ldir = normalize(vec3(u_look * 0.9 + 0.22, 0.30 + u_lookY * 0.6, 0.85));
  float diff = clamp(dot(nrm, Ldir), 0.0, 1.0);
  col *= 0.90 + 0.17 * diff;

  // ── palpebre: battito NATURALE a copertura — la pelle della palpebra scende
  //    dall'alto sull'occhio (colore campionato dalla guancia: zero smearing,
  //    a differenza del warp che trascinava giù ciglia e sopracciglia)
  float lidAmt = clamp(u_blink + u_lid * 0.45, 0.0, 1.0);
  if (lidAmt > 0.01) {
    // pelle campionata sul ponte del naso (tra gli occhi): punto sempre sicuro,
    // mai ombra né capelli come sotto l'occhio
    vec3 skin = texture(u_tex, vec2((u_eyeL.x + u_eyeR.x) * 0.5, (u_eyeL.y + u_eyeR.y) * 0.5 + 0.020)).rgb;
    vec2 d1 = (uv - u_eyeL) * vec2(1.0, 1.30);
    vec2 d2 = (uv - u_eyeR) * vec2(1.0, 1.30);
    float m1 = smoothstep(0.030, 0.017, length(d1));
    float m2 = smoothstep(0.030, 0.017, length(d2));
    // ny: 0 in cima all'occhio → 1 in fondo; corsa 1.3× così il battito pieno
    // copre TUTTO l'occhio (a 1.0 la smoothstep lasciava scoperta la base)
    float lidTravel = lidAmt * 1.3;
    float ny1 = clamp((uv.y - (u_eyeL.y - 0.015)) / 0.030, 0.0, 1.0);
    float ny2 = clamp((uv.y - (u_eyeR.y - 0.015)) / 0.030, 0.0, 1.0);
    float cov1 = m1 * smoothstep(lidTravel + 0.10, lidTravel - 0.10, ny1);
    float cov2 = m2 * smoothstep(lidTravel + 0.10, lidTravel - 0.10, ny2);
    col = mix(col, skin * 0.96, max(cov1, cov2));
    // la linea delle ciglia segue il bordo della palpebra
    float lash = max(m1 * exp(-pow((ny1 - lidAmt) * 7.0, 2.0)), m2 * exp(-pow((ny2 - lidAmt) * 7.0, 2.0)));
    col *= 1.0 - lash * lidAmt * 0.30;
  }

  // ombra interna tra le labbra quando la bocca si apre
  float gap = exp(-pow(dJ.x * 55.0, 2.0)) * exp(-pow((dJ.y - u_speak * 0.0028) * 160.0, 2.0));
  col *= 1.0 - gap * u_speak * 0.42;

  // circuiti cyan: un impulso di luce li percorre dall'alto in basso
  float accent = clamp((min(col.g, col.b) - col.r) * 2.2, 0.0, 1.0) * step(col.b - col.g, 0.28);
  float travel = pow(0.5 + 0.5 * sin(uv.y * 26.0 - u_time * (1.3 + u_flow * 1.6)), 6.0);
  float brightness = 0.95 + u_glow * 0.40 + accent * (0.5 + travel * 1.8) + u_amplitude * 0.45 * flowM;
  col = mix(col, vec3(0.50, 0.86, 1.00), accent * travel * 0.45);

  // grana pointillista che scintilla: la figura resta "fatta di particelle"
  float grain = 0.84 + 0.16 * hash21(floor(uv * vec2(420.0, 440.0)) + floor(u_time * 2.0));

  // brillantini su abito e capelli
  float spark = step(0.9985, hash21(floor(uv * vec2(300.0, 310.0)))) * pow(0.5 + 0.5 * sin(u_time * 2.6 + uv.x * 40.0), 5.0);
  brightness += spark * 2.0 * step(0.45, lum);

  // il solletico la fa brillare dove la sfiori
  brightness += tick * 0.6;

  // l'orlo in basso si dissolve in polvere (l'aura di particelle lo raccoglie)
  float nz = hash21(floor(uv * vec2(80.0, 90.0)));
  float dis = smoothstep(0.86, 0.99, uv.y + nz * 0.06);

  float a = tex.a * (1.0 - dis) * 0.94;
  vec3 outc = col * u_tint * brightness * grain;
  outc += outc * u_pulse * (0.3 + 0.4 * hash21(uv * 7.0));   // pulse evento: scintillio
  outColor = vec4(outc * a, a);
}`;

// ── Shader delle PARTICELLE (aura, pioggia binaria, polvere, halo) ───────────

const PT_VERTEX = `#version 300 es
precision highp float;

in vec3 a_anchor;   // aura: posizione mondo dal pixel; procedurali: inutilizzato
in vec4 a_color;    // aura: rgb del pixel + maschera accento cyan
in vec4 a_misc;     // s1, s2 (random), quanto fluisce, kind

uniform float u_time;
uniform float u_aspect;
uniform float u_amplitude;
uniform float u_glow;
uniform float u_flow;
uniform float u_calm;
uniform float u_pulse;
uniform float u_pointScale;
uniform float u_fit;
uniform vec3  u_tint;
uniform vec2  u_sway;      // x: inclinazione busto (rad), y: lean verso camera
uniform float u_wind;
uniform vec2  u_fly;       // planata verso il widget appena aperto
uniform float u_look;      // parallasse verso il cursore (profondità)
uniform vec2  u_mouseW;    // cursore in coordinate mondo
uniform float u_tickle;

out vec3  v_color;
out float v_alpha;
out float v_soft;

const float PI  = 3.14159265359;
const float TAU = 6.28318530718;

float hash(float n) { return fract(sin(n) * 43758.5453123); }

vec3 curl(vec3 p) {
  // pseudo-curl economico: tre sinusoidi sfasate, abbastanza organico per capelli
  return vec3(
    sin(p.y * 2.1 + p.z * 1.3) * cos(p.x * 1.7),
    sin(p.z * 1.9 + p.x * 1.1) * cos(p.y * 2.3),
    sin(p.x * 2.4 + p.y * 1.6) * cos(p.z * 1.2)
  );
}

mat3 rotY(float a) { float s = sin(a), c = cos(a); return mat3(c, 0., s, 0., 1., 0., -s, 0., c); }
mat3 rotX(float a) { float s = sin(a), c = cos(a); return mat3(1., 0., 0., 0., c, -s, 0., s, c); }
mat3 rotZ(float a) { float s = sin(a), c = cos(a); return mat3(c, -s, 0., s, c, 0., 0., 0., 1.); }

const vec3  COL_SILVER = vec3(0.80, 0.86, 0.95);
const vec3  COL_AZURE  = vec3(0.64, 0.78, 0.99);
const vec3  COL_CYAN   = vec3(0.50, 0.86, 1.00);
const vec3  COL_DEEP   = vec3(0.28, 0.46, 0.85);
const float HALO_Y     = 0.70;   // quota dell'anello di cubi (combacia con l'immagine)

void main() {
  float t = u_time;
  float kind = a_misc.w;
  float s1 = a_misc.x, s2 = a_misc.y;
  float flowAmt = a_misc.z;
  vec3 pos = vec3(0.0);
  vec3 col = COL_SILVER;
  float brightness = 1.0;
  float size = 1.0;
  float soft = 0.5;
  float alpha = 1.0;
  bool background = false;

  if (kind < 0.5) {
    // ── AURA: particelle nate dai bordi della figura, libere di fluire ───────
    pos = a_anchor;
    col = a_color.rgb;
    float accent = a_color.a;
    float lum = dot(col, vec3(0.299, 0.587, 0.114));

    vec3 cn = curl(pos * vec3(2.1, 1.6, 2.1) + vec3(0.0, -t * (0.35 + u_flow * 0.55), s1 * 5.0));
    float fl = flowAmt * (1.0 - 0.40 * u_calm);
    pos.x += cn.x * fl * (0.018 + 0.026 * u_flow) + u_wind * fl * 0.045;
    pos.y += cn.y * fl * (0.012 + 0.016 * u_flow);
    pos.z += cn.z * fl * 0.02;
    pos.x += sin(pos.y * 7.0 - t * 4.5 + s1 * TAU) * u_amplitude * 0.025 * flowAmt;

    // le punte si dissolvono in polvere che sale piano
    float dis = smoothstep(-0.74, -0.90, pos.y) * flowAmt;
    pos.y -= dis * s2 * 0.06;
    pos.x += dis * (s1 - 0.5) * 0.12;

    float travel = pow(0.5 + 0.5 * sin(pos.y * 9.0 - t * (1.3 + u_flow * 1.6) + s1 * 3.0), 6.0);
    brightness = 0.7 + 1.1 * lum + u_glow * 0.3 + accent * (0.6 + travel * 2.0) + u_amplitude * 0.5 * flowAmt;
    col = mix(col, COL_CYAN, accent * travel * 0.5);
    float glint = step(0.984, s2) * pow(0.5 + 0.5 * sin(t * 2.5 + s1 * 43.0), 6.0);
    brightness += glint * 2.2 * step(0.5, lum);

    // solletico: le particelle vicino al cursore sciamano via ridendo
    vec2 dm = pos.xy - u_mouseW;
    float md = length(dm);
    float tk = u_tickle * smoothstep(0.30, 0.04, md);
    pos.xy += normalize(dm + 0.0001) * tk * 0.05 * (0.5 + 0.5 * sin(t * 12.0 + s1 * TAU));
    brightness += tk * 1.4;

    pos += normalize(vec3(pos.x, pos.y + 0.1, pos.z) + 0.0001) * u_pulse * 0.05 * s2;

    alpha = (0.22 + 0.45 * smoothstep(0.05, 0.55, lum)) * (1.0 - dis * 0.6);
    size = 0.9 + 0.6 * lum + glint * 0.4;
    soft = mix(0.6, 0.35, lum);
  } else if (kind < 1.5) {
    // ── Pioggia binaria: colonne di cifre che cadono piano sul fondo blu notte
    background = true;
    float colIdx = floor(s1 * 46.0);
    float speed = 0.045 + hash(colIdx * 3.7) * 0.10;
    float x = (colIdx / 46.0 - 0.5) * 3.2 + (hash(colIdx * 9.1) - 0.5) * 0.04;
    float y = 1.30 - mod(s2 * 2.9 + t * speed, 2.6);
    pos = vec3(x, y, 0.85);   // z positivo = lontano: la pioggia sta DIETRO la figura

    float blinkR = step(0.45, hash(colIdx * 17.3 + floor(t * (1.5 + hash(colIdx) * 4.0)) * 0.731 + s2 * 7.0));
    brightness = (0.10 + 0.28 * hash(s2 * 41.7)) * blinkR + u_pulse * 0.3;
    col = mix(COL_DEEP, COL_CYAN, hash(s2 * 13.9) * 0.4);
    alpha = 0.5 * blinkR;
    size = 1.05;
    soft = 0.30;
  } else if (kind < 2.5) {
    // ── Polvere stellare ambientale che orbita lentamente
    float orbit = t * (0.02 + s2 * 0.05) * (s1 > 0.5 ? 1.0 : -1.0);
    float rr = 0.55 + s2 * 0.55;
    float y = (hash(s1 * 31.7) - 0.35) * 1.5;
    pos = vec3(cos(s1 * TAU + orbit) * rr, y + sin(t * 0.3 + s1 * TAU) * 0.04, sin(s1 * TAU + orbit) * rr * 0.8);
    col = mix(COL_SILVER, COL_AZURE, s2);
    brightness = 0.18 + 0.25 * hash(s2 * 57.1) + u_pulse * 0.8;
    alpha = 0.35;
    size = 0.9;
    soft = 1.0;
  } else {
    // ── HALO vivo: cubi digitali che ruotano e si frammentano sopra il capo,
    //    sovrapposti all'halo dipinto nell'immagine — la firma di Kira.
    float ci = floor(s1 * 22.0);
    float ringPos = ci / 22.0 * TAU + t * 0.10;
    float ringR = 0.165 + 0.010 * sin(t * 0.5 + ci);
    vec3 center = vec3(cos(ringPos) * ringR, HALO_Y + sin(ringPos * 2.0 + t * 0.3) * 0.010, sin(ringPos) * ringR * 0.55);

    float fragSel = step(0.62, hash(ci * 5.7));
    float fragPhase = 0.5 + 0.5 * sin(t * 0.35 + ci * 2.7);
    vec3 drift = vec3(sin(t * 0.3 + ci) * 0.6, 0.9, cos(t * 0.25 + ci * 1.3) * 0.5) * 0.085;
    center += fragSel * fragPhase * drift * (1.0 + u_pulse * 2.0);

    float h1 = hash(s2 * 37.1), h2 = hash(s2 * 59.3), h3 = hash(s2 * 83.7);
    vec3 boxp = vec3(h1, h2, h3) - 0.5;
    float m = max(abs(boxp.x), max(abs(boxp.y), abs(boxp.z)));
    boxp *= 0.5 / max(m, 0.0001);                                // proietta sulla faccia del cubo
    float cubeSize = 0.024 + 0.012 * hash(ci * 11.3);
    boxp = rotY(t * 0.45 + ci * 1.9) * rotX(ci * 0.8 + t * 0.2) * (boxp * cubeSize);
    pos = center + boxp;

    brightness = 1.2 + 0.5 * sin(t * 1.2 + ci) + u_pulse * 1.6;
    col = mix(vec3(0.92, 0.97, 1.0), COL_CYAN, 0.35 + 0.3 * hash(ci * 3.1));
    alpha = 0.7 - fragSel * fragPhase * 0.45;
    size = 1.2;
    soft = 0.25;                                                 // spigoli digitali nitidi
  }

  if (!background) {
    // portamento: stessa oscillazione della figura + parallasse di profondità
    // (auto + verso il cursore: l'aura scorre sulla figura → sensazione 3D)
    pos = rotZ(u_sway.x) * pos;
    float parallax = sin(t * 0.12) * 0.5 + sin(t * 0.047) * 0.3;
    pos.x += pos.z * (parallax * 0.12 + u_look * 0.55);
    pos.y += sin(t * 0.23) * 0.006 - u_sway.y * smoothstep(-0.2, 0.6, pos.y) * 0.035;
    pos.xy += u_fly;
  }

  float persp = 1.35 / (1.35 + pos.z * 0.9);
  vec2 screen = vec2(pos.x * persp / u_aspect, pos.y * persp) * 1.04 * u_fit;
  gl_Position = vec4(screen, pos.z * 0.1, 1.0);

  float twinkle = 0.88 + 0.12 * sin(t * (2.0 + s2 * 3.0) + s1 * TAU);
  v_color = col * u_tint * brightness * (0.55 + u_glow) * twinkle;
  v_alpha = alpha * persp;
  v_soft = soft;
  gl_PointSize = max(size * u_pointScale * persp * (1.0 + u_pulse * 0.4), 1.0);
}`;

const PT_FRAGMENT = `#version 300 es
precision highp float;

in vec3  v_color;
in float v_alpha;
in float v_soft;
out vec4 outColor;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d) * 4.0;
  if (r2 > 1.0) discard;
  // Polish 18/06 (estetico, reversibile — era mix(6.0, 2.4)): bordi particelle leggermente
  // più morbidi → resa più eterea/lunare, senza toccare forma/proporzioni della figura.
  float falloff = exp(-r2 * mix(5.2, 2.2, v_soft));
  float a = v_alpha * falloff;
  outColor = vec4(v_color * a, a);   // premoltiplicato → glow morbido senza aloni sporchi
}`;

// ── Preparazione: maschera figura + campionamento aura ───────────────────────

type FigureData = {
  texCanvas: HTMLCanvasElement;
  depthImg: HTMLImageElement | null;   // depth map: se manca, rilievo piatto
  anchor: Float32Array;
  color: Float32Array;
  misc: Float32Array;
  bgCount: number;       // particelle da disegnare DIETRO la figura (pioggia, polvere)
  totalCount: number;
  halfW: number;
  figW: number;
  eyeL: [number, number];   // anchor anatomici in UV (rilevati o fallback misurato)
  eyeR: [number, number];
  mouth: [number, number];
};

// Rileva gli occhi VERI cercando i pixel dell'iride (azzurro chiaro) nella zona
// del volto: niente più glow decentrato — palpebre e bocca si ancorano qui.
function detectEyes(px: Uint8ClampedArray, w: number, h: number): { L: [number, number]; R: [number, number] } | null {
  const pts: Array<{ u: number; v: number }> = [];
  const y0 = Math.floor(h * 0.13), y1 = Math.ceil(h * 0.24);
  const x0 = Math.floor(w * 0.38), x1 = Math.ceil(w * 0.64);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const p = (y * w + x) * 4;
      const r = px[p] / 255, g = px[p + 1] / 255, b = px[p + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (b > 0.52 && b - r > 0.10 && g > 0.42 && lum > 0.30 && lum < 0.92) {
        pts.push({ u: x / w, v: y / h });
      }
    }
  }
  if (pts.length < 14) return null;
  const midU = pts.reduce((s, p) => s + p.u, 0) / pts.length;
  const left = pts.filter((p) => p.u < midU);
  const right = pts.filter((p) => p.u >= midU);
  if (left.length < 6 || right.length < 6) return null;
  const cen = (arr: typeof pts): [number, number] => [
    arr.reduce((s, p) => s + p.u, 0) / arr.length,
    arr.reduce((s, p) => s + p.v, 0) / arr.length,
  ];
  const L = cen(left), R = cen(right);
  const dx = R[0] - L[0];
  if (dx < 0.02 || dx > 0.10 || Math.abs(L[1] - R[1]) > 0.025) return null;
  return { L, R };
}

function flowFor(u: number, v: number): number {
  const du = Math.abs(u - 0.5);
  if (v < 0.30 && du < 0.105) return 0.05;
  if (v < 0.58 && du < 0.14) return 0.18;
  return Math.min(1, 0.25 + du * 1.9 + Math.max(0, v - 0.45) * 1.1);
}

async function buildFigure(totalPoints: number): Promise<FigureData | null> {
  const img = new Image();
  img.src = FIGURE_SRC;
  const depth = new Image();
  depth.src = DEPTH_SRC;
  const depthPromise = depth.decode().then(() => depth).catch(() => null);
  try {
    await img.decode();
  } catch {
    return null;
  }
  const depthImg = await depthPromise;
  const maxW = 720;
  const sc = Math.min(1, maxW / (img.naturalWidth || 1));
  const w = Math.max(2, Math.round(img.naturalWidth * sc));
  const h = Math.max(2, Math.round(img.naturalHeight * sc));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  // maschera figura: pixel luminosi, chiari e poco saturi (capelli/abito/pelle)
  // o cyan-circuito. Lo sfondo blu notte e le cifre binarie restano fuori.
  const mask = new Float32Array(w * h);
  const lums = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const r = px[p * 4] / 255, g = px[p * 4 + 1] / 255, b = px[p * 4 + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lums[p] = lum;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = (mx - mn) / (mx + 1e-3);
    const cyan = Math.min(g, b) - r > 0.10 && b - g < 0.28 && lum > 0.34;
    mask[p] = lum > 0.5 || (lum > 0.2 && sat < 0.5) || cyan ? 1 : 0;
  }

  // ammorbidisci la maschera (2 passate di box blur 3×3): bordi setosi, non seghettati
  for (let pass = 0; pass < 2; pass++) {
    const src = mask.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        mask[p] = (
          src[p] + src[p - 1] + src[p + 1] + src[p - w] + src[p + w] +
          src[p - w - 1] + src[p - w + 1] + src[p + w - 1] + src[p + w + 1]
        ) / 9;
      }
    }
  }

  // scrivi la maschera nell'alpha e carica come texture
  for (let p = 0; p < w * h; p++) px[p * 4 + 3] = Math.round(mask[p] * 255);
  ctx.putImageData(imgData, 0, 0);

  // aura: campiona bordi della silhouette + zone fluenti (capelli/veli) + punti luce
  const kept: number[] = [];
  const cdf: number[] = [];
  let acc = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (mask[p] < 0.35) continue;
      // NIENTE aura sul viso: le particelle libere intorno a occhi/bocca si
      // disallineano dalla figura quando lei si muove → "occhi che si buggano"
      const u = x / w, v = y / h;
      if (v < 0.33 && Math.abs(u - 0.5) < 0.14) continue;
      const edge = Math.min(mask[p - 1], mask[p + 1], mask[p - w], mask[p + w]) < 0.30 ? 1 : 0;
      const flow = flowFor(u, v);
      const wgt = edge * 1.2 + flow * 0.9 * mask[p] + (lums[p] > 0.78 ? 0.25 : 0);
      if (wgt < 0.25) continue;
      kept.push(p);
      acc += wgt;
      cdf.push(acc);
    }
  }
  if (kept.length < 300) return null;

  const imgAspect = w / h;
  const figW = FIG_H * imgAspect;
  const halfW = figW / 2;
  const toWorld = (u: number, v: number): [number, number] => [(u - 0.5) * figW, TOP_Y - v * FIG_H];

  const nRain = Math.round(totalPoints * 0.16);
  const nDust = Math.round(totalPoints * 0.08);
  const nHalo = Math.round(totalPoints * 0.14);
  const nAura = Math.max(0, totalPoints - nRain - nDust - nHalo);
  const bgCount = nRain + nDust;

  const anchor = new Float32Array(totalPoints * 3);
  const color = new Float32Array(totalPoints * 4);
  const misc = new Float32Array(totalPoints * 4);

  const pickPixel = (r: number): number => {
    let lo = 0, hi = cdf.length - 1;
    const target = r * acc;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return kept[lo];
  };

  for (let i = 0; i < totalPoints; i++) {
    // ordine nel buffer = ordine di disegno: prima dietro (pioggia+polvere), poi davanti
    let kind: number;
    if (i < nRain) kind = 1;
    else if (i < nRain + nDust) kind = 2;
    else if (i < nRain + nDust + nAura) kind = 0;
    else kind = 3;

    if (kind === 0) {
      const p = pickPixel(Math.random());
      const pxX = p % w, pxY = Math.floor(p / w);
      const u = (pxX + Math.random()) / w;
      const v = (pxY + Math.random()) / h;
      const [wx, wy] = toWorld(u, v);
      anchor[i * 3] = wx;
      anchor[i * 3 + 1] = wy;
      anchor[i * 3 + 2] = (Math.random() - 0.5) * 0.06;   // profondità: micro-parallasse

      const r = px[p * 4] / 255, g = px[p * 4 + 1] / 255, b = px[p * 4 + 2] / 255;
      color[i * 4] = Math.min(1, Math.pow(r, 0.82) * 1.06);
      color[i * 4 + 1] = Math.min(1, Math.pow(g, 0.82) * 1.06);
      color[i * 4 + 2] = Math.min(1, Math.pow(b, 0.82) * 1.06);
      const cyanK = Math.max(0, Math.min(1, (Math.min(g, b) - r) * 2.2));
      color[i * 4 + 3] = b - g < 0.28 ? cyanK : 0;
      misc[i * 4 + 2] = Math.min(1, flowFor(u, v) * 1.25 + 0.1);
    } else {
      misc[i * 4 + 2] = 0;
    }
    misc[i * 4] = Math.random();
    misc[i * 4 + 1] = Math.random();
    misc[i * 4 + 3] = kind;
  }

  // anchor anatomici: occhi rilevati dall'iride; bocca derivata dalla geometria
  // del volto (rapporto misurato sul riferimento: bocca ≈ 1.16× la distanza
  // interoculare sotto il punto medio degli occhi)
  // la detection vale solo se CONCORDA con la misura manuale (±0.025): tinte
  // ciano su guance/ombre possono trascinare i centroidi fuori dall'iride
  const eyes = detectEyes(px, w, h);
  const agrees = eyes
    && Math.abs(eyes.L[0] - EYE_UV[0][0]) < 0.025 && Math.abs(eyes.L[1] - EYE_UV[0][1]) < 0.025
    && Math.abs(eyes.R[0] - EYE_UV[1][0]) < 0.025 && Math.abs(eyes.R[1] - EYE_UV[1][1]) < 0.025;
  const eyeL: [number, number] = agrees && eyes ? eyes.L : EYE_UV[0];
  const eyeR: [number, number] = agrees && eyes ? eyes.R : EYE_UV[1];
  // bocca: misura diretta (il punto medio degli occhi non è centrato sul viso,
  // che è ruotato di tre quarti)
  const mouth: [number, number] = MOUTH_UV;

  console.info(`[ParticleCore] anchors ${JSON.stringify({ detected: eyes, agrees: !!agrees, eyeL, eyeR, mouth, depth: !!depthImg })}`);
  return { texCanvas: cv, depthImg, anchor, color, misc, bgCount, totalCount: totalPoints, halfW, figW, eyeL, eyeR, mouth };
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('[ParticleCore] shader compile failed', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  if (!p) return null;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[ParticleCore] program link failed', gl.getProgramInfoLog(p));
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

// l'aura sostituisce gran parte dei punti: metà del budget storico basta
const PARTICLE_COUNT: Record<string, number> = { low: 8000, medium: 15000, high: 24000 };
const DPR_CAP: Record<string, number> = { low: 0.75, medium: 1.5, high: 2.0 };
const FRAME_INTERVAL_MS: Record<string, number> = { low: 1000 / 30, medium: 0, high: 0 };

export function ParticleCoreCanvas({ mode = 'idle', amplitude = 0, performanceMode = 'medium' }: ParticleCoreCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef<VoiceMode>(mode);
  const ampRef = useRef(amplitude);

  useEffect(() => { modeRef.current = mode || 'idle'; }, [mode]);
  useEffect(() => { ampRef.current = Number.isFinite(amplitude) ? amplitude : 0; }, [amplitude]);

  // Hook di preview/screenshot: forza uno stato dell'avatar dalla console o dai test.
  //   window.__kiraSetMode('sleep'|'alert'|'briefing'|'update'|...)  — torna al normale al prossimo cambio di prop.
  useEffect(() => {
    const w = window as unknown as { __kiraSetMode?: (m: VoiceMode) => void };
    w.__kiraSetMode = (m: VoiceMode) => { modeRef.current = m; };
    // Evento per richiedere uno stato da qualunque componente: dispatch('kira:setMode', {detail:'briefing'}).
    const onSetMode = (e: Event) => {
      const m = (e as CustomEvent<VoiceMode>).detail;
      if (m) modeRef.current = m;
    };
    window.addEventListener('kira:setMode', onSetMode as EventListener);
    return () => { delete w.__kiraSetMode; window.removeEventListener('kira:setMode', onSetMode as EventListener); };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    // Fallback CSS-only: bagliore etereo (no WebGL2 / shader / immagine mancante)
    const cssFallback = () => {
      canvas.style.background = 'radial-gradient(circle at 50% 38%, rgba(245,248,255,0.9) 0%, rgba(200,214,238,0.5) 18%, rgba(150,180,230,0.22) 42%, transparent 68%)';
      canvas.style.filter = 'blur(10px)';
    };

    let disposed = false;
    let cleanupGL: (() => void) | null = null;

    (async () => {
      const count = PARTICLE_COUNT[performanceMode] ?? PARTICLE_COUNT.medium;
      const data = await buildFigure(count);
      if (disposed) return;
      if (!data) { cssFallback(); return; }

      const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) { cssFallback(); return; }

      const ptProgram = linkProgram(gl, PT_VERTEX, PT_FRAGMENT);
      const figProgram = linkProgram(gl, FIG_VERTEX, FIG_FRAGMENT);
      if (!ptProgram || !figProgram) { cssFallback(); return; }

      // — VAO particelle —
      const ptVao = gl.createVertexArray();
      gl.bindVertexArray(ptVao);
      const makeBuf = (arr: Float32Array, name: string, comps: number) => {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(ptProgram, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, comps, gl.FLOAT, false, 0, 0);
        return buf;
      };
      const bufAnchor = makeBuf(data.anchor, 'a_anchor', 3);
      const bufColor = makeBuf(data.color, 'a_color', 4);
      const bufMisc = makeBuf(data.misc, 'a_misc', 4);

      // — VAO figura: griglia densa per il rilievo 3D (depth nel vertex shader) —
      const figVao = gl.createVertexArray();
      gl.bindVertexArray(figVao);
      const gridVerts = new Float32Array((SEG_X + 1) * (SEG_Y + 1) * 2);
      for (let y = 0; y <= SEG_Y; y++) {
        for (let x = 0; x <= SEG_X; x++) {
          const i = (y * (SEG_X + 1) + x) * 2;
          gridVerts[i] = x / SEG_X;
          gridVerts[i + 1] = y / SEG_Y;
        }
      }
      const gridIdx = new Uint16Array(SEG_X * SEG_Y * 6);
      let ii = 0;
      for (let y = 0; y < SEG_Y; y++) {
        for (let x = 0; x < SEG_X; x++) {
          const a = y * (SEG_X + 1) + x;
          const b = a + 1;
          const c = a + (SEG_X + 1);
          const d = c + 1;
          gridIdx[ii++] = a; gridIdx[ii++] = c; gridIdx[ii++] = b;
          gridIdx[ii++] = b; gridIdx[ii++] = c; gridIdx[ii++] = d;
        }
      }
      const quadBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
      gl.bufferData(gl.ARRAY_BUFFER, gridVerts, gl.STATIC_DRAW);
      const uvLoc = gl.getAttribLocation(figProgram, 'a_uv');
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
      const gridIbo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gridIbo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridIdx, gl.STATIC_DRAW);

      // — texture della figura (immagine mascherata) —
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data.texCanvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // — texture depth (unit 1): se il PNG manca, piano neutro 1×1 → tutto piatto
      const depthTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, depthTex);
      if (data.depthImg) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data.depthImg);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([115, 115, 115, 255]));
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);

      const ptU = (name: string) => gl.getUniformLocation(ptProgram, name);
      const figU = (name: string) => gl.getUniformLocation(figProgram, name);
      const pt = {
        time: ptU('u_time'), aspect: ptU('u_aspect'), amp: ptU('u_amplitude'), glow: ptU('u_glow'),
        flow: ptU('u_flow'), calm: ptU('u_calm'), pulse: ptU('u_pulse'),
        pointScale: ptU('u_pointScale'), fit: ptU('u_fit'), tint: ptU('u_tint'),
        sway: ptU('u_sway'), wind: ptU('u_wind'),
        fly: ptU('u_fly'), look: ptU('u_look'), mouseW: ptU('u_mouseW'), tickle: ptU('u_tickle'),
      };
      const fig = {
        time: figU('u_time'), aspect: figU('u_aspect'), fit: figU('u_fit'),
        swayRot: figU('u_swayRot'), lean: figU('u_lean'), figW: figU('u_figW'),
        tex: figU('u_tex'), glow: figU('u_glow'), flow: figU('u_flow'), calm: figU('u_calm'),
        lid: figU('u_lid'), amp: figU('u_amplitude'), pulse: figU('u_pulse'), tint: figU('u_tint'),
        eyeL: figU('u_eyeL'), eyeR: figU('u_eyeR'),
        fly: figU('u_fly'), look: figU('u_look'), lookY: figU('u_lookY'), depth: figU('u_depth'),
        mouse: figU('u_mouse'), tickle: figU('u_tickle'),
        mouth: figU('u_mouth'), speak: figU('u_speak'),
        blink: figU('u_blink'), headTilt: figU('u_headTilt'), armL: figU('u_armL'), armR: figU('u_armR'),
      };

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // colori premoltiplicati

      let aspect = 1;
      let fit = 1;
      const frameIntervalMs = FRAME_INTERVAL_MS[performanceMode] ?? FRAME_INTERVAL_MS.medium;
      const resize = () => {
        const rect = host.getBoundingClientRect();
        const cap = DPR_CAP[performanceMode] ?? DPR_CAP.medium;
        const dpr = Math.min(window.devicePixelRatio || 1, cap);
        const cw = Math.max(60, Math.round(rect.width * dpr));
        const ch = Math.max(60, Math.round(rect.height * dpr));
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        gl.viewport(0, 0, cw, ch);
        aspect = cw / Math.max(1, ch);
        // la figura (capelli compresi) deve entrare orizzontalmente anche in host stretti
        fit = Math.min(1, (aspect * 0.96) / (data.halfW * 1.04));
      };
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      resize();

      // ── Stato animato lato JS: tutto interpolato, niente scatti ──────────────
      const start = performance.now();
      let lastFrame = start;
      let timeAccum = 0;
      let raf = 0;

      let smoothAmp = 0;
      let smoothGlow = stateFor(modeRef.current).glow;
      let smoothFlow = stateFor(modeRef.current).flow;
      let smoothCalm = stateFor(modeRef.current).calm;
      let smoothLid = stateFor(modeRef.current).lid;
      let smoothLean = stateFor(modeRef.current).lean;
      const smoothTint: [number, number, number] = [...stateFor(modeRef.current).tint];

      let pulse = 0;
      function onEventPulse(e: Event) {
        const level = (e as CustomEvent<{ level?: string }>).detail?.level || 'info';
        pulse = Math.min(1, pulse + (level === 'error' ? 0.7 : 0.45));
      }
      window.addEventListener('kira:eventPulse', onEventPulse as EventListener);

      // bocca: pulsa anche quando Kira risponde per iscritto (token stream chat)
      let speakPulse = 0;
      let smoothSpeak = 0;
      function onSpeakPulse(e: Event) {
        const energy = (e as CustomEvent<{ energy?: number }>).detail?.energy ?? 0.5;
        speakPulse = Math.min(1, speakPulse + energy * 0.5);
      }
      window.addEventListener('kira:speakPulse', onSpeakPulse as EventListener);

      // solletico + sguardo: tracking del cursore sopra il core
      const mouseW: [number, number] = [0, 9]; // lontano finché il mouse non entra
      const mouseUV: [number, number] = [0.5, -1];
      let tickle = 0;
      let tickleTarget = 0;
      let look = 0;
      let lookTarget = 0;
      let lookY = 0;
      let lookYTarget = 0;
      let lastMove = performance.now();
      const onPointerMove = (e: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        const cx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const cy = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
        const wx = (cx * aspect) / (1.04 * fit);
        const wy = cy / (1.04 * fit);
        const now = performance.now();
        const speed = Math.hypot(wx - mouseW[0], wy - mouseW[1]) / (Math.max(8, now - lastMove) / 1000);
        tickleTarget = Math.min(1, Math.max(tickleTarget, speed * 0.35));
        lastMove = now;
        mouseW[0] = wx;
        mouseW[1] = wy;
        mouseUV[0] = wx / data.figW + 0.5;
        mouseUV[1] = (TOP_Y - wy) / FIG_H;
        lookTarget = Math.max(-1, Math.min(1, cx));
        lookYTarget = Math.max(-1, Math.min(1, cy));
      };
      const onPointerLeave = () => { tickleTarget = 0; lookTarget = 0; lookYTarget = 0; mouseW[1] = 9; mouseUV[1] = -1; };
      host.addEventListener('pointermove', onPointerMove);
      host.addEventListener('pointerleave', onPointerLeave);

      // planata verso il widget appena aperto o trascinato (kira:flyTo da canvasStore
      // e WidgetWindow): lei "va ad aprirlo" / lo accompagna spingendolo
      const fly: [number, number] = [0, 0];
      const flyTarget: [number, number] = [0, 0];
      let flyUntil = 0;
      function onFlyTo(e: Event) {
        const d = (e as CustomEvent<{ x?: number; y?: number; hold?: number }>).detail || {};
        flyTarget[0] = Math.max(-1, Math.min(1, d.x ?? 0)) * 0.26;
        flyTarget[1] = -Math.max(-1, Math.min(1, d.y ?? 0)) * 0.10;
        flyUntil = performance.now() + (d.hold ?? 2400);
      }
      window.addEventListener('kira:flyTo', onFlyTo as EventListener);

      // ── Gesti UMANI: battito di ciglia, capo, braccia — Kira è una persona ───
      let blink = 0;
      let blinkPhase = -1;                       // -1 = a riposo
      let nextBlinkAt = start + 1500 + Math.random() * 2500;
      let headTilt = 0, headTiltT = 0;
      let armL = 0, armLT = 0;
      let armR = 0, armRT = 0;
      let nextGestureAt = start + 2500;
      // "onda" della mano alzata: ogni ~9-17s un saluto morbido di ~2s, ben visibile
      let waveUntil = 0;
      let nextWaveAt = start + 5000;

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

      const render = (nowMs: number) => {
        if (frameIntervalMs > 0 && nowMs - lastFrame < frameIntervalMs) {
          raf = requestAnimationFrame(render);
          return;
        }
        const dt = Math.min(0.1, (nowMs - lastFrame) / 1000);
        lastFrame = nowMs;

        const tuning = stateFor(modeRef.current);
        smoothAmp = lerp(smoothAmp, Math.min(1, Math.max(0, ampRef.current || 0)), 0.12);
        smoothGlow = lerp(smoothGlow, tuning.glow, 0.04);
        smoothFlow = lerp(smoothFlow, tuning.flow, 0.03);
        smoothCalm = lerp(smoothCalm, tuning.calm, 0.04);
        smoothLid = lerp(smoothLid, tuning.lid, 0.06);
        smoothLean = lerp(smoothLean, tuning.lean, 0.03);
        smoothTint[0] = lerp(smoothTint[0], tuning.tint[0], 0.04);
        smoothTint[1] = lerp(smoothTint[1], tuning.tint[1], 0.04);
        smoothTint[2] = lerp(smoothTint[2], tuning.tint[2], 0.04);
        pulse *= Math.exp(-dt * 1.4);

        timeAccum += dt * (reduceMotion ? 0.25 : 1.0);
        const t = timeAccum;

        // solletico e sguardo si rilassano da soli quando il mouse si ferma
        tickleTarget *= Math.exp(-dt * 2.2);
        tickle = lerp(tickle, tickleTarget, 0.08);
        look = lerp(look, lookTarget, 0.05);
        lookY = lerp(lookY, lookYTarget, 0.05);

        // energia di parola: voce reale (mode speaking) o stream di testo
        speakPulse *= Math.exp(-dt * 3.0);
        const speakEnergy = Math.max(modeRef.current === 'speaking' ? smoothAmp : 0, speakPulse);
        const articulated = Math.min(0.85, speakEnergy * Math.min(1, Math.max(0, 0.55 + 0.35 * Math.sin(t * 10.3) + 0.10 * Math.sin(t * 23.7))));
        smoothSpeak = lerp(smoothSpeak, articulated, 0.3);

        // planata: raggiunge il widget, indugia, torna fluttuando al centro
        const nowP = performance.now();
        if (nowP > flyUntil) { flyTarget[0] = 0; flyTarget[1] = 0; }
        const fk = 1 - Math.exp(-dt * 2.0);
        const flyVelX = (flyTarget[0] - fly[0]) * fk;
        fly[0] += flyVelX;
        fly[1] += (flyTarget[1] - fly[1]) * fk;

        // ── battito di ciglia naturale: chiusura rapida, attimo, riapertura dolce;
        //    ogni tanto un doppio battito, come fanno le persone vere
        if (blinkPhase < 0 && nowP >= nextBlinkAt) blinkPhase = 0;
        if (blinkPhase >= 0) {
          blinkPhase += dt * 1000;
          if (blinkPhase < 100) blink = blinkPhase / 100;
          else if (blinkPhase < 145) blink = 1;
          else if (blinkPhase < 345) blink = 1 - (blinkPhase - 145) / 200;
          else {
            blink = 0;
            blinkPhase = -1;
            nextBlinkAt = nowP + (Math.random() < 0.12 ? 280 : 2600 + Math.random() * 3800);
          }
        }

        // ── gesti di capo e braccia: bersagli nuovi ogni 4-9s, easing morbido.
        //    Quando parla gesticola di più; quando plana tende la mano al widget.
        if (nowP >= nextGestureAt) {
          nextGestureAt = nowP + 4000 + Math.random() * 5000;
          headTiltT = (Math.random() - 0.5) * 0.26;
          armLT = -0.10 + Math.random() * 0.50;
          armRT = Math.random() < 0.5 ? 0.5 + Math.random() * 0.5 : 0;
        }

        // respiro dei gesti: il braccio e il capo non sono MAI fermi del tutto
        const armLBase = Math.sin(t * 0.50) * 0.08 + Math.sin(t * 0.21) * 0.05;
        const headBase = Math.sin(t * 0.30) * 0.035;
        const armRBase = 0.25 + 0.20 * Math.sin(t * 0.5);

        // saluto: la mano alzata fa un'onda elegante (parlando capita più spesso)
        if (nowP >= nextWaveAt) {
          waveUntil = nowP + 2200;
          nextWaveAt = nowP + (smoothSpeak > 0.2 ? 6000 : 9000) + Math.random() * 8000;
        }
        const waveK = waveUntil > nowP
          ? Math.min(1, (waveUntil - nowP) / 500) * Math.min(1, (2200 - (waveUntil - nowP)) / 400)
          : 0;
        const wave = waveK * Math.sin(t * 7.0) * 0.13;

        // solletico → la mano alzata RESPINGE il cursore e lei si scosta ridendo
        const nearX = mouseUV[0] - 0.5;
        const nearV = mouseUV[1];
        const prox = nearV > 0.05 && nearV < 0.85 ? Math.max(0, 1 - Math.abs(nearX) / 0.30) : 0;
        const repel = prox * Math.min(1, tickle * 2.2 + 0.25 * prox);
        const reach = Math.min(0.18, Math.abs(flyVelX) * 30 + (flyTarget[0] !== 0 || flyTarget[1] !== 0 ? 0.10 : 0));

        const gk = 1 - Math.exp(-dt * 1.6);
        headTilt += (headTiltT + headBase - Math.sign(nearX || 1) * repel * 0.045 - headTilt) * gk;
        armL += (armLT + armLBase + wave + (nearX > 0 ? repel * 0.30 : repel * -0.10) + reach + smoothSpeak * 0.06 - armL) * (waveK > 0 ? 1 - Math.exp(-dt * 5.0) : gk);
        armR += (armRT + armRBase + smoothSpeak * 0.45 - armR) * gk * 0.8;

        // portamento: oscillazione MOLTO lieve (il movimento vero è nei gesti),
        // capelli al vento; quando plana o viene solleticata si scosta col busto
        const sway = (Math.sin(t * 0.10) * 0.6 + Math.sin(t * 0.037) * 0.4) * 0.016 * (1 - 0.5 * smoothCalm)
          + look * 0.018 - Math.sign(nearX || 1) * repel * 0.022;
        const wind = (Math.sin(t * 0.23) * 0.6 + Math.sin(t * 0.071) * 0.4) * (0.4 + 0.6 * smoothFlow) + smoothAmp * 0.3 - flyVelX * 40;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // 1) particelle di sfondo (pioggia binaria + polvere)
        gl.useProgram(ptProgram);
        gl.bindVertexArray(ptVao);
        gl.uniform1f(pt.time, t);
        gl.uniform1f(pt.aspect, aspect);
        gl.uniform1f(pt.amp, smoothAmp);
        gl.uniform1f(pt.glow, smoothGlow);
        gl.uniform1f(pt.flow, smoothFlow);
        gl.uniform1f(pt.calm, smoothCalm);
        gl.uniform1f(pt.pulse, pulse);
        gl.uniform1f(pt.pointScale, Math.max(1, canvas.height / 360));
        gl.uniform1f(pt.fit, fit);
        gl.uniform3f(pt.tint, smoothTint[0], smoothTint[1], smoothTint[2]);
        gl.uniform2f(pt.sway, sway, smoothLean);
        gl.uniform1f(pt.wind, wind);
        gl.uniform2f(pt.fly, fly[0], fly[1]);
        gl.uniform1f(pt.look, look);
        gl.uniform2f(pt.mouseW, mouseW[0], mouseW[1]);
        gl.uniform1f(pt.tickle, tickle);
        gl.drawArrays(gl.POINTS, 0, data.bgCount);

        // 2) la figura
        gl.useProgram(figProgram);
        gl.bindVertexArray(figVao);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, depthTex);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(fig.tex, 0);
        gl.uniform1i(fig.depth, 1);
        gl.uniform1f(fig.time, t);
        gl.uniform1f(fig.aspect, aspect);
        gl.uniform1f(fig.fit, fit);
        gl.uniform1f(fig.swayRot, sway);
        gl.uniform1f(fig.lean, smoothLean);
        gl.uniform1f(fig.figW, data.figW);
        gl.uniform1f(fig.glow, smoothGlow);
        gl.uniform1f(fig.flow, smoothFlow);
        gl.uniform1f(fig.calm, smoothCalm);
        gl.uniform1f(fig.lid, smoothLid);
        gl.uniform1f(fig.amp, smoothAmp);
        gl.uniform1f(fig.pulse, pulse);
        gl.uniform3f(fig.tint, smoothTint[0], smoothTint[1], smoothTint[2]);
        gl.uniform2f(fig.eyeL, data.eyeL[0], data.eyeL[1]);
        gl.uniform2f(fig.eyeR, data.eyeR[0], data.eyeR[1]);
        gl.uniform2f(fig.fly, fly[0], fly[1]);
        gl.uniform1f(fig.look, look);
        gl.uniform1f(fig.lookY, lookY);
        gl.uniform2f(fig.mouse, mouseUV[0], mouseUV[1]);
        gl.uniform1f(fig.tickle, tickle);
        gl.uniform2f(fig.mouth, data.mouth[0], data.mouth[1]);
        // hook di verifica visiva: window.__kiraCoreDebug = { blink, armL, … }
        // forza una posa per gli screenshot di test (nessun costo se assente)
        const dbg = (window as unknown as { __kiraCoreDebug?: Record<string, number> }).__kiraCoreDebug;
        gl.uniform1f(fig.speak, dbg?.speak ?? smoothSpeak);
        gl.uniform1f(fig.blink, dbg?.blink ?? blink);
        gl.uniform1f(fig.headTilt, dbg?.headTilt ?? headTilt);
        gl.uniform1f(fig.armL, dbg?.armL ?? armL);
        gl.uniform1f(fig.armR, dbg?.armR ?? armR);
        gl.drawElements(gl.TRIANGLES, gridIdx.length, gl.UNSIGNED_SHORT, 0);

        // 3) aura + halo davanti alla figura
        gl.useProgram(ptProgram);
        gl.bindVertexArray(ptVao);
        gl.drawArrays(gl.POINTS, data.bgCount, data.totalCount - data.bgCount);

        raf = requestAnimationFrame(render);
      };
      raf = requestAnimationFrame(render);

      const onVisibility = () => {
        if (document.hidden) cancelAnimationFrame(raf);
        else { lastFrame = performance.now(); raf = requestAnimationFrame(render); }
      };
      document.addEventListener('visibilitychange', onVisibility);

      cleanupGL = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('kira:eventPulse', onEventPulse as EventListener);
        window.removeEventListener('kira:speakPulse', onSpeakPulse as EventListener);
        window.removeEventListener('kira:flyTo', onFlyTo as EventListener);
        host.removeEventListener('pointermove', onPointerMove);
        host.removeEventListener('pointerleave', onPointerLeave);
        gl.deleteProgram(ptProgram);
        gl.deleteProgram(figProgram);
        gl.deleteBuffer(bufAnchor);
        gl.deleteBuffer(bufColor);
        gl.deleteBuffer(bufMisc);
        gl.deleteBuffer(quadBuf);
        gl.deleteBuffer(gridIbo);
        gl.deleteTexture(tex);
        gl.deleteTexture(depthTex);
        gl.deleteVertexArray(ptVao);
        gl.deleteVertexArray(figVao);
      };
    })();

    return () => {
      disposed = true;
      cleanupGL?.();
    };
  }, [performanceMode]);

  return (
    <div
      ref={hostRef}
      style={{ width: '100%', height: '100%', minWidth: 60, minHeight: 60, display: 'block', position: 'relative' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
