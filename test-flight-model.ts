// 飞行模型回归测试（纯逻辑，不需要浏览器）
// 运行：node --experimental-strip-types test-flight-model.ts
import {
  stepFlight,
  SPAWN,
  BOUNDS,
  MAX_ROLL,
  MAX_ROLL_LOW_SPEED,
  MIN_SPEED,
  MAX_SPEED,
  ALT_MIN,
  ALT_MAX,
  advanceMeters,
  rotateToward,
} from './src/flight.ts';

let failures = 0;
function check(cond, msg) {
  if (cond) {
    console.log('  ok   ' + msg);
  } else {
    failures++;
    console.log('  FAIL ' + msg);
  }
}
const keys = (...codes) => new Set(codes);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

console.log('T1 右横滚压杆：roll 增长且不超过上限');
{
  const s = { ...SPAWN };
  for (let i = 0; i < 60; i++) stepFlight(s, keys('KeyD'), 1 / 60);
  check(s.roll > 50, `roll 上升到 ${s.roll.toFixed(1)}°（应接近上限 ${MAX_ROLL}°）`);
  check(s.roll <= MAX_ROLL + 1e-9, 'roll 未超过上限');
}

console.log('T2 协调转弯：右坡度使航向右转（顺时针增大）');
{
  const s = { ...SPAWN, heading: 0, speed: 40 };
  for (let i = 0; i < 60; i++) stepFlight(s, keys('KeyD'), 1 / 60);
  check(s.heading > 20, `1 秒右压杆后航向 ${s.heading.toFixed(1)}°（应明显右转）`);
}

console.log('T3 松杆回中：横滚与俯仰阻尼回归 0');
{
  const s = { ...SPAWN, roll: 40, pitch: 15, speed: 40 };
  for (let i = 0; i < 300; i++) stepFlight(s, keys(), 1 / 60);
  check(Math.abs(s.roll) < 1, `5 秒松杆后 roll=${s.roll.toFixed(2)}°（应回中）`);
  check(Math.abs(s.pitch) < 1, `5 秒松杆后 pitch=${s.pitch.toFixed(2)}°（应回中）`);
}

console.log('T4 油门：Shift 推满后速度趋近 MAX_SPEED');
{
  const s = { ...SPAWN, throttle: 0, speed: MIN_SPEED };
  for (let i = 0; i < 600; i++) stepFlight(s, keys('ShiftLeft'), 1 / 60);
  check(s.throttle > 0.99, `throttle=${s.throttle.toFixed(2)}（应接近 1）`);
  check(s.speed > MAX_SPEED * 0.95, `speed=${s.speed.toFixed(1)} m/s（应趋近 ${MAX_SPEED}）`);
}

console.log('T5 油门杆保持：松手油门不动（油门杆语义），Ctrl 收油门后速度回落到蠕行速');
{
  // 油门是「杆位」语义：不按键时保持当前杆位，不会自动回零
  const hold = { ...SPAWN, throttle: 1, speed: MAX_SPEED };
  for (let i = 0; i < 300; i++) stepFlight(hold, keys(), 1 / 60);
  check(hold.throttle > 0.99, `松手后 throttle=${hold.throttle.toFixed(2)}（杆位保持）`);
  const s = { ...SPAWN, throttle: 1, speed: MAX_SPEED };
  for (let i = 0; i < 900; i++) stepFlight(s, keys('ControlLeft'), 1 / 60);
  check(s.throttle < 0.01, `按 Ctrl 后 throttle=${s.throttle.toFixed(2)}（应收零）`);
  check(Math.abs(s.speed - MIN_SPEED) < 1, `速度回落到 ${s.speed.toFixed(1)} m/s（应停在蠕行速度 ${MIN_SPEED}）`);
}

console.log('T6 航向推进：航向 90°（正东）时 lng 增大、lat 基本不变');
{
  const s = { ...SPAWN, heading: 90, pitch: 0, speed: 50 };
  const start = [s.lng, s.lat];
  const speed0 = s.speed;
  for (let i = 0; i < 60; i++) stepFlight(s, keys(), 1 / 60);
  const metersEast = (s.lng - start[0]) * 111320 * Math.cos(start[1] * Math.PI / 180);
  // 位移应介于起止速度之间（速度单调趋近油门目标），不依赖具体标定值
  const lo = Math.min(speed0, s.speed), hi = Math.max(speed0, s.speed);
  check(s.lng > start[0], `向东飞 lng 由 ${start[0]} 增至 ${s.lng.toFixed(5)}`);
  check(Math.abs(s.lat - start[1]) < 1e-5, `正东飞行 lat 不漂移（Δ=${(s.lat - start[1]).toExponential(2)})`);
  check(metersEast > lo * 0.98 && metersEast < hi * 1.02, `1 秒向东 ${metersEast.toFixed(1)} m（应介于起止速度 ${lo.toFixed(1)}–${hi.toFixed(1)} m/s 之间）`);
}

console.log('T7 抬机头爬升：W 使 alt 上升，俯仰角受上限约束');
{
  // V1-010 修复：起点必须高于 ALT_MIN（此前 alt=200 < 400，即使无爬升分量，
  // 下限钳位也满足 alt>210 的断言，无法区分真爬升）
  const s = { ...SPAWN, pitch: 0, speed: 50, alt: 600 };
  for (let i = 0; i < 120; i++) stepFlight(s, keys('KeyW'), 1 / 60);
  check(s.pitch > 15, `pitch=${s.pitch.toFixed(1)}°（抬机头）`);
  check(s.alt > 610, `高度由 600 爬升至 ${s.alt.toFixed(0)} m`);
  // 无键对照：松杆回中后残余俯仰只带来很小的漂移，不再爬升
  const s0 = { ...SPAWN, pitch: 10, speed: 50, alt: 600 };
  for (let i = 0; i < 120; i++) stepFlight(s0, new Set(), 1 / 60);
  check(s0.alt < 616, `无键对照：alt=${s0.alt.toFixed(0)} 未爬升`);
  // V1-005：单按空格真实抬头（此前空格只是倍率，pitch=0 时无效果）
  const sSpace = { ...SPAWN, pitch: 0, speed: 50, alt: 600 };
  for (let i = 0; i < 120; i++) stepFlight(sSpace, keys('Space'), 1 / 60);
  check(sSpace.pitch > 15, `空格单按抬头：pitch=${sSpace.pitch.toFixed(1)}°`);
  // S+Space 冲突：压杆优先
  const sDown = { ...SPAWN, pitch: 0, speed: 50 };
  for (let i = 0; i < 60; i++) stepFlight(sDown, new Set(['KeyS', 'Space']), 1 / 60);
  check(sDown.pitch < -1, `S+Space 压杆优先：pitch=${sDown.pitch.toFixed(1)}°`);
  const s2 = { ...SPAWN, pitch: 0, speed: 50 };
  for (let i = 0; i < 300; i++) stepFlight(s2, keys('KeyW'), 1 / 60);
  check(s2.pitch <= 22.01, `pitch 受上限约束：${s2.pitch.toFixed(1)}°`);
}

console.log('T8 高度软边界：爬升不突破 ALT_MAX，俯冲不低于 ALT_MIN');
{
  const up = { ...SPAWN, pitch: 20, speed: 80, alt: ALT_MAX - 10 };
  for (let i = 0; i < 300; i++) stepFlight(up, keys('KeyW'), 1 / 60);
  check(up.alt <= ALT_MAX, `上界：alt=${up.alt.toFixed(0)} ≤ ${ALT_MAX}`);
  const dn = { ...SPAWN, pitch: -20, speed: 80, alt: ALT_MIN + 10 };
  for (let i = 0; i < 300; i++) stepFlight(dn, keys('KeyS'), 1 / 60);
  check(dn.alt >= ALT_MIN, `下界：alt=${dn.alt.toFixed(0)} ≥ ${ALT_MIN}`);
}

console.log('T9 低速限坡度：速度过低时 roll 被夹到小坡度');
{
  const s = { ...SPAWN, speed: MIN_SPEED - 0.1, roll: MAX_ROLL };
  stepFlight(s, keys(), 1 / 60);
  check(Math.abs(s.roll) <= MAX_ROLL_LOW_SPEED + 1e-9, `低速 roll 被夹到 ${s.roll.toFixed(1)}° ≤ ${MAX_ROLL_LOW_SPEED}°`);
}

console.log('T10 地理边界：飞出外环后航向被拉回市中心方向');
{
  const s = { ...SPAWN, lng: BOUNDS.maxLng + 0.02, heading: 90, speed: 60 };
  // 位于东侧边界外、航向朝东（继续远离），约束应使其转向西（市中心方向）
  for (let i = 0; i < 600; i++) stepFlight(s, keys(), 1 / 60);
  const desired = (function () {
    const dLng = (BOUNDS.centerLng - s.lng) * Math.PI / 180;
    const y = Math.sin(dLng) * Math.cos(BOUNDS.centerLat * Math.PI / 180);
    const x = Math.cos(s.lat * Math.PI / 180) * Math.sin(BOUNDS.centerLat * Math.PI / 180)
      - Math.sin(s.lat * Math.PI / 180) * Math.cos(BOUNDS.centerLat * Math.PI / 180) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  })();
  check(s.heading > 180 && s.heading < 360, `越界后航向 ${s.heading.toFixed(0)}°（应转向西）`);
  check(Math.abs(((s.heading - desired + 540) % 360) - 180) < 30, `航向 ${s.heading.toFixed(0)}° 已对齐市中心方向 ${desired.toFixed(0)}°`);
}

console.log('T11 advanceMeters 往返闭合（web mercator 纬度尺度残差应远小于 1m）');
{
  const [a, b] = advanceMeters(SPAWN.lng, SPAWN.lat, 1234, -567);
  const [c, d] = advanceMeters(a, b, -1234, 567);
  const errLng = Math.abs(c - SPAWN.lng) * 111320 * Math.cos(SPAWN.lat * Math.PI / 180);
  const errLat = Math.abs(d - SPAWN.lat) * 110540;
  check(errLng + errLat < 1, `往返残差 ${errLng.toFixed(3)} + ${errLat.toFixed(3)} m（2.7km 往返应 <1m）`);
}

console.log('T12 rotateToward 走最短路径');
{
  check(rotateToward(350, 10, 5) === 355, '350→10 逆时针走 350→355');
  check(rotateToward(10, 350, 5) === 5, '10→350 顺时针走 10→5');
  check(rotateToward(180, 270, 1000) === 270, '不限制时直接到目标');
}

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
