# Changelog

## [1.10.0](https://github.com/Endika/eslojusto/compare/v1.9.0...v1.10.0) (2026-10-07)


### Features

* **engine:** add employment input, scope gate and labelled readings ([8e66e44](https://github.com/Endika/eslojusto/commit/8e66e44e5e42d7277d815319689b964d493df117))
* **engine:** add employment norms, rules and the 2023-2026 minimum wage table ([5898ef9](https://github.com/Endika/eslojusto/commit/5898ef9fcf57fc46bc8b143920e475c1f1857c8c))
* **engine:** add rental input, scope gate and two-reading outcomes ([997f5ce](https://github.com/Endika/eslojusto/commit/997f5cedd0900a7e4fe11ac62c7ea2b825879fe9))
* **engine:** check annual rent updates against the cap in force on each anniversary ([df5f6f8](https://github.com/Endika/eslojusto/commit/df5f6f8a0149dfcc775ab33c9191925194bf60b6))


### Bug Fixes

* **engine:** anchor remote work costs, date the reform by signing and bound employment input ([de158f0](https://github.com/Endika/eslojusto/commit/de158f0e03ac544d278b1b3749613175d1e29d95))
* **engine:** carry update bases year by year and take late rises as that year's update ([c07ef32](https://github.com/Endika/eslojusto/commit/c07ef326b4bf9af2d8d5dcb54cc53477356ece27))
* **engine:** read the IGC within 0 and 2 % as Ley 2/2015 sets for revisions ([fb34468](https://github.com/Endika/eslojusto/commit/fb3446893df06554a14f728f61e13f9a75f090aa))
* **engine:** take a rise applied early as its anniversary's update ([a63fd38](https://github.com/Endika/eslojusto/commit/a63fd3835688ab758766a9023d85fc8b960986ee))
* **engine:** weigh the RDL 26/2026 update wording and keep the CPI cap for 2023 contracts ([a28fddf](https://github.com/Endika/eslojusto/commit/a28fddfde2048cb198bca08f9cfb11f9dae74463))

## [1.9.0](https://github.com/Endika/eslojusto/compare/v1.8.0...v1.9.0) (2026-10-07)


### Features

* **engine:** add IRAV, CPI, IGC and legal interest tables with their sources ([8181606](https://github.com/Endika/eslojusto/commit/81816066d310716a1f363c1dcb261047e3890fb6))
* **engine:** add rental norms with validity windows and status ([7074aaf](https://github.com/Endika/eslojusto/commit/7074aaf76fa1ea665d386cedc9e28ec041a96d90))
* **engine:** load the CPI flash estimates and weigh them against the definitive figure ([31ccaf7](https://github.com/Endika/eslojusto/commit/31ccaf77bde3b1c0a54f0eafa278c8fcc1d3f338))
* **engine:** load the CPI flash estimates from April 2022 to November 2024 ([412dea8](https://github.com/Endika/eslojusto/commit/412dea8d474710ffefbb0e0c473ded3f13cd40f3))


### Bug Fixes

* **engine:** carry RDL 29/2026 and 28/2026 doubts to the update clause and tacit renewal ([7e473f3](https://github.com/Endika/eslojusto/commit/7e473f3db5fc571b5c6ae1077754c642bba8f2eb))

## [1.8.0](https://github.com/Endika/eslojusto/compare/v1.7.0...v1.8.0) (2026-10-07)


### Features

* **api:** chart reads with nothing read by reason and their share on the dashboard ([957608c](https://github.com/Endika/eslojusto/commit/957608ccfafd4acd6f93be63538e01de3874c754))
* **api:** read up to 25 images and cap the input estimate at 96,000 tokens ([eed9cc1](https://github.com/Endika/eslojusto/commit/eed9cc136ec042deaf0d2223309e68c6561729ce))
* **api:** say why each page can't be read and answer nothing_read when a read yields no field ([e0fa7dc](https://github.com/Endika/eslojusto/commit/e0fa7dc021cf073041f47b841c2eb48fa28b6e6e))
* **documents:** say why pages went unread and warn before sending a dark, blurry or small photo ([d9ec60c](https://github.com/Endika/eslojusto/commit/d9ec60c8bf437fe788ff896760b0d6628128f91c))
* **documents:** show encoding progress and stop early when a pack can't fit ([88d091c](https://github.com/Endika/eslojusto/commit/88d091c37f4b5f8f89894daeb126cb81ff5ece2f))
* **documents:** step a page down to 1280 then 1100 px when no JPEG quality fits its share ([966d78c](https://github.com/Endika/eslojusto/commit/966d78cecbdb94b6210908472e88fa26ed480191))
* **documents:** take up to 25 photos or PDF pages per read ([8457fb3](https://github.com/Endika/eslojusto/commit/8457fb365d95e72e30fa3dcd3466abc37154a915))


### Performance Improvements

* **documents:** measure photo quality with plain typed-array loops ([5e281b6](https://github.com/Endika/eslojusto/commit/5e281b6223523da599e429b8149e159e6d64d5e7))
* **documents:** start a shorter long side at JPEG quality 0.65 ([be98e12](https://github.com/Endika/eslojusto/commit/be98e12224e6b5b5936c6dcdcdc14640f965b2a2))

## [1.7.0](https://github.com/Endika/eslojusto/compare/v1.6.0...v1.7.0) (2026-10-07)


### Features

* **documents:** give pass holders a general letter when nothing falls short ([1619bef](https://github.com/Endika/eslojusto/commit/1619bef9c042d5087d49300303e9ae7171bb7697))

## [1.6.0](https://github.com/Endika/eslojusto/compare/v1.5.0...v1.6.0) (2026-10-07)


### Features

* **api:** verify a pass the browser holds ([3fdf076](https://github.com/Endika/eslojusto/commit/3fdf076375dbf6e9ad9119e1fe4c1f15a68386dc))
* ask whether holiday days are working or calendar days ([ca816c6](https://github.com/Endika/eslojusto/commit/ca816c65ab2b8cab7ecaa2addef9bae4a9af5517))
* **documents:** build the paid detail only after the API verifies the pass ([947b0f5](https://github.com/Endika/eslojusto/commit/947b0f5088491c80202fb98845d2d2cfe4d1404f))
* **documents:** prefill the «recibí no conforme» letter with optional details ([193afb5](https://github.com/Endika/eslojusto/commit/193afb56362e852c658fff7a767e292b9dcabbe2))
* **documents:** urge downloading right after paying and say where the pass lives ([ffebaa6](https://github.com/Endika/eslojusto/commit/ffebaa68c333a134141313c5629240a45a99d2f4))
* **result:** show a free summary and keep the detail for pass holders ([0602769](https://github.com/Endika/eslojusto/commit/060276945f3ae74c06084fa7ba1c1861bb01a0d0))


### Bug Fixes

* **api:** leave a pass unconfirmed when Stripe can't find its session on a read ([8cb26ff](https://github.com/Endika/eslojusto/commit/8cb26ffb9363bafe18ff0301a49641393cd31546))
* count working-day holidays by the days worked a week ([fbe70d2](https://github.com/Endika/eslojusto/commit/fbe70d230606442b002dd2d5cd05083b5dd2f47c))
* **documents:** keep letter details on their line and blank what the font can't draw ([1764c03](https://github.com/Endika/eslojusto/commit/1764c0315a6aad2a25b562f8ba7b04db2804bb93))
* keep a pass Stripe can't confirm and drop the leave warning with its notice ([de1eadf](https://github.com/Endika/eslojusto/commit/de1eadffade03d8c3094c90099d8a62de87d46e6))
* **result:** show the case's deadlines in the free summary ([96e7b34](https://github.com/Endika/eslojusto/commit/96e7b34654c443333b2029e98b024cccc54826b6))

## [1.5.0](https://github.com/Endika/eslojusto/compare/v1.4.0...v1.5.0) (2026-10-07)


### Features

* **api:** add the eslojusto-api CloudWatch dashboard ([4fea9f4](https://github.com/Endika/eslojusto/commit/4fea9f45fd01e449e51c9acb0a6232fce231a665))
* **api:** email alerts when the API fails repeatedly ([15f5ce1](https://github.com/Endika/eslojusto/commit/15f5ce1ba6b2f236519bbe2ddbf1736c46c61e1f))
* **api:** let CloudFormation manage the API dashboard ([cc32415](https://github.com/Endika/eslojusto/commit/cc32415b0551ab5364e3ff6b543628df800edaf7))

## [1.4.0](https://github.com/Endika/eslojusto/compare/v1.3.0...v1.4.0) (2026-10-07)


### Features

* **api:** read a whole pack of page images and merge what it states ([bbbf413](https://github.com/Endika/eslojusto/commit/bbbf41358a888b58ce65e890f015f1dee36085c3))
* **documents:** read a whole pack: camera, files that add up, PDFs drawn as page images ([e4d5651](https://github.com/Endika/eslojusto/commit/e4d5651b45ebcb316f17dbc0664c800f524499b8))
* **engine:** give objective dismissals the unfair-dismissal reference ([ad94a7f](https://github.com/Endika/eslojusto/commit/ad94a7f44fe32fa4bc055fe37d79f40406cc75f9))

## [1.3.0](https://github.com/Endika/eslojusto/compare/v1.2.0...v1.3.0) (2026-10-07)


### Features

* **documents:** accept files dropped on the upload zone ([51dc790](https://github.com/Endika/eslojusto/commit/51dc79012eb55c681068805b32610ef113349606))

## [1.2.0](https://github.com/Endika/eslojusto/compare/v1.1.2...v1.2.0) (2026-10-07)


### Features

* **analytics:** add closed events for document reading and the pass ([e79e4c6](https://github.com/Endika/eslojusto/commit/e79e4c6dba0745a1eda15a9a973c01b94772299e))
* **calculator:** let other parts fill, read and open the form ([da27eca](https://github.com/Endika/eslojusto/commit/da27eca24d22da6c3e3332d69c8c43f2485cdae8))
* describe document reading, the pass and its conditions of sale only when the API is configured ([6f40287](https://github.com/Endika/eslojusto/commit/6f402874ce16ba400e51560c9fd7c651d371410d))
* **documents:** build the PDF report and the letter in the browser with the site's fonts ([34a99b7](https://github.com/Endika/eslojusto/commit/34a99b79ff309b5c6b0c48049af0179ce4d1dff5))
* **documents:** follow the API's pass reads, checkout captcha, 2 MB PDF limit and new codes ([1e8ecdf](https://github.com/Endika/eslojusto/commit/1e8ecdf65d9d1ec890ea834c8a84b1efb9bbb705))
* **documents:** mirror the API contract with a typed client, pass storage and file checks ([9ab00f3](https://github.com/Endika/eslojusto/commit/9ab00f3ad6c4bae1ca3120ff5ce1dbdacb42e51a))
* **documents:** offer the pass when an item falls short and recover it after Stripe ([4713972](https://github.com/Endika/eslojusto/commit/47139726d61013236d26a2196c809c9764ee29f9))
* **documents:** read a document into the form from a new first sheet ([8f280c6](https://github.com/Endika/eslojusto/commit/8f280c6f5d9533591b2979bd1be0b2cfe2c5190d))
* **documents:** take the API as three function URLs and read extraPayPaid and escalated ([564d506](https://github.com/Endika/eslojusto/commit/564d50686c3c369a9055c19486943801b1a0d57a))
* **documents:** wire the start sheet, the pass and the PDFs in the composition root ([f0101a0](https://github.com/Endika/eslojusto/commit/f0101a0f163b1808519ed12485bdff9bfd77df64))
* gate document reading on build-time API settings and open the CSP only to them ([b5cbeb9](https://github.com/Endika/eslojusto/commit/b5cbeb9842d1372b65b0e333ec7154c814a3b6ee))
* **i18n:** add the Spanish copy for document reading, the pass and the PDFs ([ec19ced](https://github.com/Endika/eslojusto/commit/ec19ced6f5c12cdb60470fc72b3b57442dd37e6f))
* identify the site's owner in the legal notice ([7f46fb3](https://github.com/Endika/eslojusto/commit/7f46fb30580c8154820b121eb3fa693a3948cd13))


### Bug Fixes

* **csp:** open the API and Turnstile origins only on the calculator page ([c890c38](https://github.com/Endika/eslojusto/commit/c890c38e0cfa8db2e7b7bc830570010574f5052a))
* **documents:** copy a character the PDF font lacks as «?» and keep ToUnicode in UTF-16 ([a820c13](https://github.com/Endika/eslojusto/commit/a820c13073e5e5f1d9a0fa8b66770d544132b728))
* **documents:** drop a refused pass or quota token so the next read is a free one ([7555ce6](https://github.com/Endika/eslojusto/commit/7555ce6ce504544652f1724fc64ed8fb01e75ad2))
* **documents:** hold the manual path and back button while a read is on its way ([295ec7a](https://github.com/Endika/eslojusto/commit/295ec7aad6bf7749641960a7beea3a6e874f074c))
* **documents:** keep every unredeemed payment and redeem it before charging again ([9dd3328](https://github.com/Endika/eslojusto/commit/9dd33281373837fe35ff473c370a4c9a3091be1f))
* **documents:** keep redeemed payments until their pass expires and fetch a refused pass again ([d9eb112](https://github.com/Endika/eslojusto/commit/d9eb112763ea1593bca365c5cc6f4a97eeb5780b))
* **documents:** renew a refused pass at most once and stop pointing its message at recovery ([c4a12cb](https://github.com/Endika/eslojusto/commit/c4a12cb7073c5ffe470e81c77a635d1d3b6d55e8))
* **documents:** restore and delete the kept review on any return from Stripe, cancelled or not ([58578ae](https://github.com/Endika/eslojusto/commit/58578ae61ed23f164bcf10844b7ca2baaea46297))
* **documents:** show the returned payment's error, prune dead payments and cap pass requests ([e7c953e](https://github.com/Endika/eslojusto/commit/e7c953ee4d48d551bb3e5278073fdde567a01a9e))
* **documents:** word a throttled or failing service as busy, not as a bad answer ([5d5c792](https://github.com/Endika/eslojusto/commit/5d5c7925d8a4ea862579dd5524699ec348362fdb))


### Performance Improvements

* leave the document events and error codes out of builds without the documents API ([6830562](https://github.com/Endika/eslojusto/commit/68305620cc77a206371f0655214eeea103bda4a0))
* let builds without the documents API drop its configuration too ([e8763bf](https://github.com/Endika/eslojusto/commit/e8763bf26a1c064ea24c533d4fb6d1212e48d5f3))

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
