const CapitaliskDeployer = require('./index');

const deployer = new CapitaliskDeployer({
  projectName: 'ldpos',
  networkSymbol: 'ldpos',
});

(async () => {
  // await deployer.createGenesis({
  //   networkSymbol: 'ldpos',
  //   accounts: [
  //     {
  //       address: 'ldpos71bcc5cd9c8cf5dc2c79d235ed5f2393b5ad56cb',
  //       type: 'sig',
  //       forgingPublicKey:
  //         '218a928a7c8c21f7820d3bb198e41d5175886891334f4cb900062a5acb880458',
  //       nextForgingKeyIndex: 0,
  //       multisigPublicKey:
  //         '4826718943ce648ce1999549179f85df45a2477c6a51f07c656c6dc18b6a9ddf',
  //       nextMultisigKeyIndex: 0,
  //       sigPublicKey:
  //         '71bcc5cd9c8cf5dc2c79d235ed5f2393b5ad56cb9b3f4b0102e7e32c804c0a5a',
  //       nextSigKeyIndex: 0,
  //       balance: '10000000000000000',
  //       votes: ['ldpos71bcc5cd9c8cf5dc2c79d235ed5f2393b5ad56cb'],
  //     },
  //   ],
  // });
  // await deployer.writeConfig(
  //   {
  //     modulePath: 'node_modules/ldpos-chain',
  //     genesisPath: 'genesis/mainnet/ldpos-genesis.json',
  //     components: {
  //       logger: {
  //         logFileName: 'logs/mainnet/ldpos.log',
  //         consoleLogLevel: 'debug',
  //         fileLogLevel: 'error',
  //       },
  //       dal: {
  //         libPath: 'node_modules/ldpos-pg-dal',
  //         client: 'pg',
  //         connection: {
  //           host: '127.0.0.1',
  //           user: 'ldpos',
  //           password: 'ldpos',
  //           database: 'ldpos_main',
  //           port: '5432',
  //         },
  //       },
  //     },
  //   },
  //   { extend: true },
  // );
  // await deployer.deploy();
  // await deployer.undeploy();
  await deployer.addNetwork(
    {
      networkSymbol: 'doge',
      accounts: [
        {
          address: 'doge71bcc5cd9c8cf5dc2c79d235ed5f2393b5ad56cb',
          type: 'sig',
          forgingPublicKey:
            '218a928a7c8c21f7820d3bb198e41d5175886891334f4cb900062a5acb880458',
          nextForgingKeyIndex: 0,
          multisigPublicKey:
            '4826718943ce648ce1999549179f85df45a2477c6a51f07c656c6dc18b6a9ddf',
          nextMultisigKeyIndex: 0,
          sigPublicKey:
            '71bcc5cd9c8cf5dc2c79d235ed5f2393b5ad56cb9b3f4b0102e7e32c804c0a5a',
          nextSigKeyIndex: 0,
          balance: '10000000000000000',
          votes: ['doge71bcc5cd9c8cf5dc2c79d235ed5f2393b5ad56cb'],
        },
      ],
    },
    {
      modulePath: 'node_modules/doge-chain',
      genesisPath: 'genesis/mainnet/doge-genesis.json',
      components: {
        logger: {
          logFileName: 'logs/mainnet/doge.log',
          consoleLogLevel: 'debug',
          fileLogLevel: 'error',
        },
        dal: {
          libPath: 'node_modules/doge-pg-dal',
          client: 'pg',
          connection: {
            host: '127.0.0.1',
            user: 'doge',
            password: 'doge',
            database: 'doge_main',
            port: '5432',
          },
        },
      },
    },
    { projectName: 'dogecoin' },
  );
})();
