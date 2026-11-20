import json


def fixed_courtyard_phase(page, civil_time):
    """Start a render fixture at a chosen civil time using the real visit clock."""
    # A fresh visit begins twenty minutes behind the device. A local timestamp
    # keeps the same visible courtyard hour across the browser's time zones.
    page.add_init_script(f"""(() => {{
        const start = Date.parse({json.dumps(civil_time)}) + 20 * 60_000;
        const origin = performance.now();
        Date.now = () => Math.floor(start + performance.now() - origin);
    }})();""")
