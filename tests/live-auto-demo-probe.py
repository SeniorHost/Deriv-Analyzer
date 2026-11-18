"""Optional public read-only availability/proposal probe. No account or buy requests."""
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
                message = json.loads(await asyncio.wait_for(ws.recv(), 15))
                if message.get('req_id') != counter:
                    continue
                if message.get('error'):
                    raise RuntimeError(message['error']['code'])
                return message
        contracts = await request({'contracts_for': '1HZ10V'})
        contracts['contracts_for']['available'] = [c for c in contracts['contracts_for']['available'] if c['contract_type'] in ['CALL', 'PUT'] and c['expiry_type'] == 'intraday']
        proposal = await request({'proposal': 1, 'amount': 2, 'basis': 'stake', 'contract_type': 'CALL', 'currency': 'USD', 'duration': 5, 'duration_unit': 'm', 'underlying_symbol': '1HZ10V'})
        clock = await request({'time': 1})
        print(json.dumps({'contracts': contracts, 'proposal': proposal, 'time': clock['time']}))

asyncio.run(main())
