import { expect } from "chai";
import { Asset, Name } from "@greymass/eosio";
import { Blockchain, nameToBigInt, symbolCodeToBigInt, protonAssert, expectToThrow } from "@proton/vert"

/**
 * Initialize
 */
const blockchain = new Blockchain()
const eosioToken = blockchain.createContract('token', 'assembly/token/target/token.contract');
blockchain.createAccounts('alice', 'bob')

beforeEach(() => {
  blockchain.resetTables()
})

/**
 * Helpers
 */
const getStat = (symcode: string) => {
  const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symcode));
  return eosioToken.tables!.stat(symcodeBigInt).getTableRow(symcodeBigInt)
}

const getAccount = (accountName: string, symcode: string) => {
  const accountBigInt = nameToBigInt(Name.from(accountName));
  const symcodeBigInt = symbolCodeToBigInt(Asset.SymbolCode.from(symcode));
  return eosioToken.tables!.accounts(accountBigInt).getTableRow(symcodeBigInt)
}

function currency_stats(supply: string, max_supply: string, issuer: string) {
  return {
    supply, max_supply, issuer,
  };
}

function account(balance: string) {
  return {
    balance,
  };
}

/**
 * Tests
 */
describe('Token', () => {
  describe('create', () => {
    it('Success', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      expect(getStat(symcode)).to.be.deep.equal(currency_stats(`0.000 ${symcode}`, `1000.000 ${symcode}`, 'alice'))
    });

    it('Authentication is required', async () => {
      const symcode = 'TKN';

      await expectToThrow(
        eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send('alice@active'),
        'missing required authority token'
      );
    });

    it('Negative max supply must fail', async () => {
      await expectToThrow(
        eosioToken.actions.create(['alice', '-1000.000 TKN']).send(),
        protonAssert('max-supply must be positive')
      )
    });

    it('Symbol already exists must fail', async () => {
      const action = eosioToken.actions.create(['alice', '100 TKN'])

      await action.send();

      await expectToThrow(
        action.send(),
        protonAssert('token with symbol already exists')
      )

      // The case when we try to create the same token for another account
      await expectToThrow(
        eosioToken.actions.create(['bob', '100 TKN']).send(),
        protonAssert('token with symbol already exists')
      )
    });

    it('Max supply must fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `4611686018427387903 ${symcode}`]).send();
      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0 TKN', '4611686018427387903 TKN', 'alice'))

      await expectToThrow(
        eosioToken.actions.create(['alice', '4611686018427387904 NKT']).send(),
        protonAssert('invalid asset')
      )
    });

    it('max_decimals must fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1.000000000000000000 ${symcode}`]).send();

      expect(getStat(symcode)).to.be.deep.equal(currency_stats('0.000000000000000000 TKN', '1.000000000000000000 TKN', 'alice'))

      try {
        await eosioToken.actions.create(['alice', '1.0000000000000000000 NKT']).send()
      } catch (e) {
        expect(e.message).to.be.deep.eq('Encoding error at root<create>.maximum_supply<asset>: Invalid asset symbol, precision too large')
      }
    });
  })

  describe('issue', () => {
    it('success', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `500.000 ${symcode}`, 'hola']).send('alice@active');

      expect(getStat(symcode)).to.be.deep.equal(currency_stats('500.000 TKN', '1000.000 TKN', 'alice'))
      expect(getAccount('alice', symcode)).to.be.deep.equal(account('500.000 TKN'))
    });

    it('Authentication is required', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await expectToThrow(
        eosioToken.actions.issue(['alice', `500.000 ${symcode}`, `hola`]).send(),
        'missing required authority alice'
      );

      await expectToThrow(
        eosioToken.actions.issue(['alice', `500.000 ${symcode}`, `hola`]).send('bob@active'),
        'missing required authority alice'
      );
    });

    it('Long memo should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();

      const long_memo = '256symbols-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

      await eosioToken.actions.issue(['alice', `500.000 ${symcode}`, `${long_memo}`]).send('alice@active');

      await expectToThrow(
        eosioToken.actions.issue(['alice', `500.000 ${symcode}`, `more ${long_memo}`]).send('alice@active'),
        protonAssert('memo has more than 256 bytes')
      );
    });

    it('Invalid symbol must fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();

      await expectToThrow(
        eosioToken.actions.issue(['alice', `500.000 ${symcode}N`, 'hola']).send('alice@active'),
        protonAssert('token with symbol does not exist, create token before issue')
      );
    });

    it('Issue to non issuer account should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();

      await expectToThrow(
        eosioToken.actions.issue(['bob', `500.000 ${symcode}`, `hola`]).send('alice@active'),
        protonAssert('tokens can only be issued to issuer account')
      );
    });

    it('Negative issue quantity should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();

      await expectToThrow(
        eosioToken.actions.issue(['alice', '-500.000 TKN', 'hola']).send('alice@active'),
        protonAssert('must issue positive quantity')
      )
    });

    it('Issue quantity more than available should fail', async () => {
      const symcode = 'TKN';
      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();

      await eosioToken.actions.issue(['alice', '1000.000 TKN', 'hola']).send('alice@active');

      await expectToThrow(
        eosioToken.actions.issue(['alice', '1.000 TKN', 'hola']).send('alice@active'),
        protonAssert('quantity exceeds available supply')
      );
    });
  });

  describe('retire', () => {
    it('success', async () => {
      const symcode = 'TKN';
      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();

      await eosioToken.actions.issue(['alice', `500.000 ${symcode}`, 'hola']).send('alice@active');
      expect(getStat(symcode)).to.be.deep.equal(currency_stats(`500.000 ${symcode}`, `1000.000 ${symcode}`, 'alice'))

      await eosioToken.actions.retire([`500.000 ${symcode}`, 'hola']).send('alice@active');
      expect(getStat(symcode)).to.be.deep.equal(currency_stats(`0.000 ${symcode}`, `1000.000 ${symcode}`, 'alice'))
    });

    it('Authentication is required', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, `hola`]).send('alice@active');

      await expectToThrow(
        eosioToken.actions.retire([`500.000 ${symcode}`, `hola`]).send(),
        'missing required authority alice'
      );

      await expectToThrow(
        eosioToken.actions.retire([`500.000 ${symcode}`, `hola`]).send('bob@active'),
        'missing required authority alice'
      );
    });

    it('Long memo should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, `hola`]).send('alice@active');

      const long_memo = '256symbols-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

      await eosioToken.actions.retire([`500.000 ${symcode}`, `${long_memo}`]).send('alice@active');

      await expectToThrow(
        eosioToken.actions.retire([`500.000 ${symcode}`, `more ${long_memo}`]).send('alice@active'),
        protonAssert('memo has more than 256 bytes')
      );
    });

    it('Invalid symbol must fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, `hola`]).send('alice@active');

      await expectToThrow(
        eosioToken.actions.retire([`500.000 ${symcode}N`, 'hola']).send('alice@active'),
        protonAssert('token with symbol does not exist')
      );
    });

    it('Negative retire quantity should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, `hola`]).send('alice@active');

      await expectToThrow(
        eosioToken.actions.retire(['-500.000 TKN', 'hola']).send('alice@active'),
        protonAssert('must retire positive quantity')
      )
    });

    it('Balance overdrawn', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, `hola`]).send('alice@active');

      await expectToThrow(
        eosioToken.actions.retire(['1001.000 TKN', 'hola']).send('alice@active'),
        protonAssert('overdrawn balance')
      )
    });
  })

  describe('transfer', () => {
    it('success', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, 'hola']).send('alice@active');

      await eosioToken.actions.transfer(['alice', 'bob', `300.000 ${symcode}`, 'hola']).send('alice@active');
      expect(getAccount('alice', symcode)).to.be.deep.equal(account(`700.000 ${symcode}`))
      expect(getAccount('bob', symcode)).to.be.deep.equal(account(`300.000 ${symcode}`))
    });

    it('Authentication is required', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, 'hola']).send('alice@active');

      await expectToThrow(
        eosioToken.actions.transfer(['alice', 'bob', `500.000 ${symcode}`, `hola`]).send(),
        'missing required authority alice'
      );

      await expectToThrow(
        eosioToken.actions.transfer(['alice', 'bob', `500.000 ${symcode}`, `hola`]).send('bob@active'),
        'missing required authority alice'
      );
    });

    it('Long memo should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, 'hola']).send('alice@active');

      const long_memo = '256symbols-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

      await eosioToken.actions.transfer(['alice', 'bob', `500.000 ${symcode}`, `${long_memo}`]).send('alice@active');

      await expectToThrow(
        eosioToken.actions.transfer(['alice', 'bob', `500.000 ${symcode}`, `more ${long_memo}`]).send('alice@active'),
        protonAssert('memo has more than 256 bytes')
      );
    });

    it('Cannot transfer to self', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, 'hola']).send('alice@active');

      await expectToThrow(
        eosioToken.actions.transfer(['alice', 'alice', `500.000 ${symcode}`, `hola`]).send('alice@active'),
        protonAssert('cannot transfer to self')
      );
    });

    it('Negative transfer quantity should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, 'hola']).send('alice@active');

      await expectToThrow(
        eosioToken.actions.transfer(['alice', 'bob', '-500.000 TKN', 'hola']).send('alice@active'),
        protonAssert('must transfer positive quantity')
      )
    });

    it('Transfer to non-existent recipient should fail', async () => {
      const symcode = 'TKN';

      await eosioToken.actions.create(['alice', `1000.000 ${symcode}`]).send();
      await eosioToken.actions.issue(['alice', `1000.000 ${symcode}`, 'hola']).send('alice@active');

      await expectToThrow(
        eosioToken.actions.transfer(['alice', 'tom', '500.000 TKN', 'hola']).send('alice@active'),
        protonAssert('to account does not exist')
      )
    });
  });
});