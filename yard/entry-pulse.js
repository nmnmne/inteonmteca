// xyz is the crossing point in world metres, w is progress (-1 when idle).
export const entryPulseShader = `
  uniform vec4 entryPulse;
  vec3 applyEntryPulse(vec3 base, vec3 world, out float energy) {
    energy = 0.0;
    if (entryPulse.w < 0.0) return base;
    float behind = 118.0 * entryPulse.w - distance(world, entryPulse.xyz);
    float crest = 1.0 - smoothstep(0.0, 3.5, abs(behind));
    float wake = smoothstep(0.0, 4.0, behind) * (1.0 - smoothstep(5.0, 17.0, behind));
    float echo = 1.0 - smoothstep(0.0, 2.5, abs(behind - 19.0));
    float fade = smoothstep(0.0, 0.035, entryPulse.w) * (1.0 - smoothstep(0.70, 1.0, entryPulse.w));
    energy = max(crest, max(wake * 0.53, echo * 0.62)) * fade;
    vec3 colour = mix(vec3(0.30, 0.85, 0.95), vec3(0.55, 0.28, 0.97), smoothstep(1.0, 12.0, behind));
    return mix(base, colour, energy);
  }`;
