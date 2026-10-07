# Changelog

## [1.1.2](https://github.com/Endika/eslojusto/compare/v1.1.1...v1.1.2) (2026-10-07)


### Bug Fixes

* **infra:** let CloudFormation read the bootstrap version and the log groups' streams ([438a86a](https://github.com/Endika/eslojusto/commit/438a86ae46cb588c296d6038cdb1a52700afc949))

## [1.1.1](https://github.com/Endika/eslojusto/compare/v1.1.0...v1.1.1) (2026-10-07)


### Bug Fixes

* **infra:** trust the immutable OIDC subject the repository signs ([4dd2edd](https://github.com/Endika/eslojusto/commit/4dd2eddd2941884d44d5ffd63dd4cff616d87ea1))

## [1.1.0](https://github.com/Endika/eslojusto/compare/v1.0.1...v1.1.0) (2026-10-07)


### Features

* **api:** flag underestimated reads and unsaved pass counts in the logs ([d1445b9](https://github.com/Endika/eslojusto/commit/d1445b9e4f8f7383e9ddbf7a21e6af6e22ef2d65))
* **api:** read documents into the engine's fields with escalation by doubt ([f72e651](https://github.com/Endika/eslojusto/commit/f72e651a2429f1907ee7cc83491d9a1722706a42))
* **api:** read whether a payslip pays a full extra payment in its period ([dc35125](https://github.com/Endika/eslojusto/commit/dc351250e9e42c1bc78533c7f40bbc0f330629f9))
* **api:** say in every extract answer whether the read escalated ([cc49c06](https://github.com/Endika/eslojusto/commit/cc49c06a7b82a38ea338079ab56034581b94c910))
* **api:** sell the pass with Stripe Checkout and sign it ([392e653](https://github.com/Endika/eslojusto/commit/392e6533c2a56291b773c4edd6f8ed46335393ef))
* **infra:** define the api and its spending guards with cdk ([927b092](https://github.com/Endika/eslojusto/commit/927b092c8209c7051adfc9abbfccc83d0f6435b6))
* **infra:** deploy without reserved concurrency while the account quota is too low ([bd680f1](https://github.com/Endika/eslojusto/commit/bd680f1c2c92b2e7e84c0382bbd1a113db563793))


### Bug Fixes

* **api:** bound read cost, check the captcha first and count pass reads in Stripe ([82863e7](https://github.com/Endika/eslojusto/commit/82863e73a822c006f3b3b5c6623bce75781feedc))
* **api:** use a Stripe restricted key and keep the full key out of every role ([bdf99b0](https://github.com/Endika/eslojusto/commit/bdf99b01919150790b3e5ca22fb81ab54682972e))
* **infra:** deploy the global stack with the caller's credentials ([e88c19c](https://github.com/Endika/eslojusto/commit/e88c19cd3736dcb434f73a1eabf0d739cd454532))
* **infra:** reserve payment concurrency and tighten log and budget-action policies ([af69974](https://github.com/Endika/eslojusto/commit/af69974c0d633b76f42bf01331911e4b579344a6))

## [1.0.1](https://github.com/Endika/eslojusto/compare/v1.0.0...v1.0.1) (2026-10-06)


### Bug Fixes

* only offer language links on the same site ([4dad6ef](https://github.com/Endika/eslojusto/commit/4dad6efc60b0580e9b123cf09799abb4ee75704d))

## 1.0.0 (2026-10-06)


### Features

* launch eslojusto.es with the finiquito review ([a9dbd68](https://github.com/Endika/eslojusto/commit/a9dbd684fa6ca06d962d1f4608f7e146f3562ef5))
