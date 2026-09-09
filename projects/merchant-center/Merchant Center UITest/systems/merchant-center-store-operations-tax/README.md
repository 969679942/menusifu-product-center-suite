# Merchant Center Store Operations Tax Pilot

This is a candidate portability pilot for the generic system-test platform. It runs one authenticated,
reversible Store Operations tax-type edit through API seed, UI mutation, independent API/UI assertions,
checkpointed cleanup, and API/UI zero-residue verification.

The generated rule remains `provisional`. A passing runtime does not promote it to `formal`.

```powershell
npm run build:system-test:tax-pilot
npm run test:system:tax-pilot
```
