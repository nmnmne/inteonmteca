def fixed_courtyard_phase(page):
    """Use the unshifted sun in render fixtures that specify exact solar hours."""
    def serve_clock(route):
        response = route.fetch()
        # Scope deterministic randomness to the solar module so birds and weather
        # still run with their own normal randomness.
        module = "const Math = Object.create(globalThis.Math); Math.random = () => 0;\n"
        route.fulfill(response=response, body=module + response.text())
    page.route("**/yard/solar-clock.js*", serve_clock)
