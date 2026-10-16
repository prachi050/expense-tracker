import { maskAccountNumbers, containsAccountNumber } from '../src/lib/redact'

let passed = 0, failed = 0
const check = (name: string, actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed += 1; return }
  failed += 1
  console.log(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`)
}

// Removed
check('long account number', maskAccountNumbers('ONLINE TRANSFER TO ACCT 987654321098'), 'ONLINE TRANSFER TO ACCT ••••1098')
check('card number', maskAccountNumbers('CARD 4111111111111111 PURCHASE'), 'CARD ••••1111 PURCHASE')
check('spaced card number', maskAccountNumbers('VISA 4111 1111 1111 1111'), 'VISA ••••1111')
check('dashed card number', maskAccountNumbers('VISA 4111-1111-1111-1111'), 'VISA ••••1111')
check('seven digits is the threshold', maskAccountNumbers('REF 1234567'), 'REF ••••4567')
check('two numbers in one line', maskAccountNumbers('FROM 987654321098 TO 123456789012'), 'FROM ••••1098 TO ••••9012')
check('zelle trailing date and ref', maskAccountNumbers('ZELLE PAYMENT FROM JOHN SMITH 20261011 BACDEFGH'), 'ZELLE PAYMENT FROM JOHN SMITH ••••1011 BACDEFGH')

// Kept, because these are how you recognise a transaction
check('store number kept', maskAccountNumbers('STARBUCKS STORE 08123'), 'STARBUCKS STORE 08123')
check('six digits kept', maskAccountNumbers('REF 123456'), 'REF 123456')
check('phone number kept', maskAccountNumbers('NETFLIX.COM 866-579-7172 CA'), 'NETFLIX.COM 866-579-7172 CA')
check('short transfer tail kept', maskAccountNumbers('ONLINE BANKING TRANSFER TO SAVINGS 1234'), 'ONLINE BANKING TRANSFER TO SAVINGS 1234')
check('merchant code kept', maskAccountNumbers('AMAZON.COM*RT4R12AB1 AMZN.COM/BILL WA'), 'AMAZON.COM*RT4R12AB1 AMZN.COM/BILL WA')
check('plain name untouched', maskAccountNumbers('TRADER JOE\'S #123 SAN JOSE CA'), 'TRADER JOE\'S #123 SAN JOSE CA')

// Nothing full-length survives
const scrubbed = maskAccountNumbers('ACCT 987654321098 CARD 4111111111111111')
check('no full account number remains', /\d{7,}/.test(scrubbed), false)
check('detector agrees', containsAccountNumber('ACCT 987654321098'), true)
check('detector is quiet otherwise', containsAccountNumber('STARBUCKS STORE 08123'), false)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
