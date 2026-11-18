"""Optional public read-only multiactive probe; Python websockets required."""
import asyncio
import json
import websockets

async def main():
    async with websockets.connect('wss://api.derivws.com/trading/v1/options/ws/public', open_timeout=15) as ws:
        counter = 0
        async def request(payload):
            nonlocal counter
            counter += 1
            await ws.send(json.dumps(dict(payload, req_id=counter)))
            while True:
                response = json.loads(await asyncio.wait_for(ws.recv(), 15))
                if response.get('req_id') != counter:
                    continue
                if response.get('error'):
                    raise RuntimeError(response['error'])
                return response
        catalog = (await request({'active_symbols': 'brief'}))['active_symbols']
        clock = (await request({'time': 1}))['time']
        samples = {}
        for symbol in ['1HZ10V', 'RB100', 'frxEURUSD', 'BOOM1000', 'stpRNG', 'JD10']:
            samples[symbol] = await request({'ticks_history': symbol, 'end': 'latest', 'count': 1001, 'style': 'candles', 'granularity': 60})
        ticks = await request({'ticks_history': 'stpRNG', 'end': 'latest', 'count': 1000, 'style': 'ticks'})
        print(json.dumps({'catalog': catalog, 'time': clock, 'samples': samples, 'ticks': ticks}))

asyncio.run(main())
