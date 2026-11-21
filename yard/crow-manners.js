// Relative poses for an unoccupied bird. The gait stays on its real footfall clock.
function pulse(t, start, end) {
  if (t <= start || t >= end) return 0;
  return Math.sin(Math.PI * (t - start) / (end - start)) ** 2;
}

export function sampleCrowManner(out, profile, time, gaitPhase, speed, airborne, attention) {
  const {id, style, habits} = profile;
  const step = Math.sin(gaitPhase), walking = Math.min(1, speed * 2);
  const clock = time * (.86 + .18 * habits.pace) + id * 1.77;
  const period = 6.1 + .16 * (id % 9), t = clock % period;
  const side = attention ? Math.sign(attention) : (id % 2 ? -1 : 1);
  const ground = 1 - airborne;
  let roll, pitch, glance, dip, tail, rise, wing;
  if (style === 'boss') {
    // Plant a foot, raise the chin, then survey the neighbours over one shoulder.
    const plant = pulse(t, .25, 1.22), survey = pulse(t, 1.05, 3.62);
    roll = side * (.06 + .10 * plant) + walking * step * .07;
    pitch = -.14 - .12 * plant; glance = side * .65 * survey;
    dip = -.22 - .19 * plant; tail = .14 * survey; rise = .022 * plant; wing = .12 * plant;
  } else if (style === 'bandit') {
    // Low feint, glance the other way, then spring upright and tuck the wing.
    const feint = pulse(t, .22, 1.10), look = pulse(t, .81, 1.64), spring = pulse(t, 1.49, 2.20);
    roll = side * (.27 * feint - .20 * spring) + walking * step * .14;
    pitch = .10 + .28 * feint - .24 * spring; glance = side * (.86 * feint - .78 * look);
    dip = .44 * feint - .26 * spring; tail = .43 * spring; rise = .076 * spring; wing = .48 * spring;
  } else if (style === 'drifter') {
    // An uneven step, a long examination of the ground, then shake out one wing.
    const inspect = pulse(t, .18, 2.60), shake = pulse(t, 2.65, 3.72);
    roll = side * (.10 + .11 * inspect + .15 * shake * Math.sin(12 * t)) + walking * step * .10;
    pitch = .11 + .14 * inspect; glance = side * (.54 * inspect - .37 * shake);
    dip = .57 * inspect; tail = .18 * shake; rise = walking * .018 * Math.max(0, step);
    wing = .35 * shake;
  } else {
    // Two greeting nods, then turn towards company with a relaxed bounce.
    const nod = pulse(t, .20, .90) + .78 * pulse(t, 1.01, 1.76), turn = pulse(t, 1.55, 3.28);
    roll = walking * step * .10 + side * .09 * turn; pitch = .10 * nod;
    glance = side * .59 * turn; dip = .45 * nod; tail = .15 * turn;
    rise = .026 * nod; wing = .24 * turn;
  }
  // A second, quieter activity on alternate perches: check under one wing,
  // pounce at one's own foot, draw a circle with the beak, or count three tracks.
  if (Math.floor(clock / period) % 2 && speed < .65 && airborne < .18) {
    const reach = pulse(t, 3.52, 5.78);
    if (style === 'boss') {
      wing += .38 * reach; glance -= side * .94 * reach; dip += .32 * reach;
    } else if (style === 'bandit') {
      dip += .70 * pulse(t,3.58,4.70); rise += .067 * pulse(t,4.72,5.24);
      roll -= side * .22 * pulse(t,4.68,5.38);
    } else if (style === 'drifter') {
      const circle = (t-3.52)*3.9;
      glance += side * .64 * Math.sin(circle) * reach;
      dip += (.45 + .25 * Math.cos(circle)) * reach;
    } else {
      const taps = pulse(t,3.55,4.08)+pulse(t,4.20,4.76)+pulse(t,4.88,5.49);
      glance += side * .64 * reach; dip += .62 * taps;
    }
  }
  out.roll = roll * (.32 + .68 * ground);
  out.pitch = pitch * (.22 + .78 * ground);
  out.glance = glance * (.46 + .54 * ground);
  out.dip = dip * (.32 + .68 * ground);
  out.tail = tail; out.rise = rise * ground; out.wing = wing * ground;
  return out;
}
