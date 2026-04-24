const signalCode = document.getElementById("signal-code");
const clock = document.getElementById("clock");

if (signalCode) {
  const dayOfYear = Math.ceil(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );

  signalCode.textContent = `INT-${String(dayOfYear).padStart(3, "0")}`;
}

if (clock) {
  const updateClock = () => {
    const now = new Date();
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }).format(now);

    clock.textContent = `${time} UTC`;
  };

  updateClock();
  window.setInterval(updateClock, 15000);
}

const panels = document.querySelectorAll(".panel-card, .glass-card");

const onPointerMove = (event) => {
  const x = event.clientX / window.innerWidth - 0.5;
  const y = event.clientY / window.innerHeight - 0.5;

  panels.forEach((panel, index) => {
    const depth = (index % 3) + 1;
    panel.style.transform = `translate3d(${x * depth * 6}px, ${y * depth * 6}px, 0)`;
  });
};

window.addEventListener("pointermove", onPointerMove, { passive: true });
