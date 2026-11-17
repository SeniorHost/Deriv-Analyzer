"""Optional public read-only contract probe. Requires Python websockets (not a runtime dependency)."""
import asyncio
import json
import websockets

async def main():
    async with websockets.connect('wss://api.derivws.com/trading/v1/options/ws/public', open_timeout=15) as ws:
        request_id = 0
        async def request(data):
            nonlocal request_id
            request_id += 1
            current = request_id
            await ws.send(json.dumps(dict(data, req_id=current)))
            while True:
                response = json.loads(await asyncio.wait_for(ws.recv(), 15))
                if response.get('req_id') == current:
                    if response.get('error'):
                        raise RuntimeError(response['error'])
                    return response
        clock = await request({'time': 1})
        catalog = await request({'active_symbols': 'brief'})
        assert any(x.get('underlying_symbol') == '1HZ10V' for x in catalog['active_symbols'])
        chunks = []
        end = 'latest'
        for count in (801, 800, 800):
            response = await request({'ticks_history': '1HZ10V', 'end': str(end), 'count': count, 'style': 'candles', 'granularity': 60})
            chunk = response['candles']
            assert len(chunk) == count
            chunks.append(chunk)
            end = min(c['epoch'] for c in chunk) - 1
        tick = await request({'ticks': '1HZ10V', 'subscribe': 1})
        subscription = tick['subscription']['id']
        forgotten = await request({'forget': subscription})
        assert forgotten['forget'] == 1
        expiry = clock['time'] - 10
        history = await request({'ticks_history': '1HZ10V', 'end': str(expiry), 'count': 10, 'style': 'ticks'})
        ping = await request({'ping': 1})
        print(json.dumps({'time': clock['time'], 'catalogCount': len(catalog['active_symbols']), 'chunks': chunks, 'tick': tick, 'expiry': expiry, 'history': history, 'ping': ping}))

asyncio.run(main())
