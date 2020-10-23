import {task} from '@nomiclabs/buidler/config';
import {getParamPerNetwork} from '../../helpers/contracts-helpers';
import {
  deployLendingPoolCollateralManager,
  deployWalletBalancerProvider,
  deployAaveProtocolTestHelpers,
} from '../../helpers/contracts-deployments';
import {loadPoolConfig, ConfigNames} from '../../helpers/configuration';
import {AavePools, eEthereumNetwork, ICommonConfiguration} from '../../helpers/types';
import {waitForTx} from '../../helpers/misc-utils';
import {
  enableReservesToBorrow,
  enableReservesAsCollateral,
  initReservesByHelper,
} from '../../helpers/init-helpers';
import {ZERO_ADDRESS} from '../../helpers/constants';
import {exit} from 'process';
import {
  getLendingPool,
  getLendingPoolConfiguratorProxy,
  getLendingPoolAddressesProvider,
} from '../../helpers/contracts-getters';

task('full:initialize-lending-pool', 'Initialize lending pool configuration.')
  .addFlag('verify', 'Verify contracts at Etherscan')
  .addParam('pool', `Pool name to retrieve configuration, supported: ${Object.values(ConfigNames)}`)
  .setAction(async ({verify, pool}, localBRE) => {
    try {
      await localBRE.run('set-bre');
      const network = <eEthereumNetwork>localBRE.network.name;
      const poolConfig = loadPoolConfig(pool);
      const {ReserveAssets, ReservesConfig} = poolConfig as ICommonConfiguration;

      const reserveAssets = await getParamPerNetwork(ReserveAssets, network);
      const lendingPoolProxy = await getLendingPool();
      const lendingPoolConfiguratorProxy = await getLendingPoolConfiguratorProxy();

      const addressesProvider = await getLendingPoolAddressesProvider();

      const testHelpers = await deployAaveProtocolTestHelpers(addressesProvider.address, verify);

      const admin = await addressesProvider.getAaveAdmin();
      if (!reserveAssets) {
        throw 'Reserve assets is undefined. Check ReserveAssets configuration at config directory';
      }

      await initReservesByHelper(
        lendingPoolProxy.address,
        addressesProvider.address,
        lendingPoolConfiguratorProxy.address,
        ReservesConfig,
        reserveAssets,
        testHelpers,
        admin,
        ZERO_ADDRESS
      );
      await enableReservesToBorrow(
        ReservesConfig,
        reserveAssets,
        testHelpers,
        lendingPoolConfiguratorProxy
      );
      await enableReservesAsCollateral(
        ReservesConfig,
        reserveAssets,
        testHelpers,
        lendingPoolConfiguratorProxy
      );

      const collateralManager = await deployLendingPoolCollateralManager(verify);
      await waitForTx(
        await addressesProvider.setLendingPoolCollateralManager(collateralManager.address)
      );

      await deployWalletBalancerProvider(addressesProvider.address, verify);
    } catch (err) {
      console.error(err);
      exit(1);
    }
  });
