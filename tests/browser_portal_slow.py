import asyncio,time,json
from pathlib import Path
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(channel='msedge',headless=True)
  page=await b.new_page(viewport={'width':1440,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  async def slow(route):
   if '/yard/' in route.request.frame.url: await asyncio.sleep(4)
   await route.continue_()
  await page.route('**/yard/main.js*',slow)
  await page.goto('http://127.0.0.1:8080/',wait_until='domcontentloaded')
  box=await page.locator('#street-link').bounding_box();start=time.monotonic();await page.locator('#street-link').click()
  await page.wait_for_function('!!document.querySelector(".portal-doorway")')
  clip=await page.locator('.portal-doorway').evaluate('(e)=>getComputedStyle(e).maskImage.startsWith("url(")')
  await page.wait_for_timeout(650);await page.screenshot(path='tests/artifacts/refinement/button-portal-start.png')
  await page.wait_for_url('**/yard/',wait_until='domcontentloaded')
  assert await page.evaluate('document.documentElement.dataset.portalPhase')=='loading-yard'
  assert await page.evaluate('yardWalkClock.deadline') is None
  await page.screenshot(path='tests/artifacts/refinement/button-portal-loading.png')
  await page.wait_for_function('!document.documentElement.dataset.portalPhase')
  duration=time.monotonic()-start;assert duration>=5
  assert await page.evaluate('yardWalkClock.deadline>Date.now()')
  assert not errors,errors
  print(json.dumps({'button':box,'initialClip':clip,'slowSeconds':duration,'errors':errors}));await b.close()
asyncio.run(main())
