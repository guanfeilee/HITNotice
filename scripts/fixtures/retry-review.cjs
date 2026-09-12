let calls=0;
global.fetch=async()=>{calls++;throw new Error('REAL_NETWORK_FORBIDDEN')};
process.on('exit',()=>console.log(JSON.stringify({reviewNetworkCalls:calls})));
