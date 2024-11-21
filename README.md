# Admitad API Integration

## Installation

To use the library, install it through [npm](https://npmjs.com)

```shell
npm install --save admitad-webmaster-api
```

## Get clientId and clientSecret
* https://www.admitad.com/webmaster/account/settings/credentials

## Usage
    const AdmitadApi = require('admitad-webmaster-api');
    const api = new AdmitadApi(clientId, clientSecret);
    let profile = await api.getProfile();

## API
* getProfile()
* getBalance(currency: String)
* getTrafficChannels()
* getOfferLinkByOfferId(offerId: Integer, channelId: Integer)
* getStatisticsOffersByOfferId(dateFrom: timestamp, dateTo: timestamp, offerId: Integer?, channelId: Integer?, subId: String?)
* getLeadsByOfferId(dateFrom: timestamp, dateTo: timestamp, offerId: Integer?, channelId: Integer?)
* getCrByOfferId(dateFrom: timestamp, dateTo: timestamp, offerId: Integer, channelId: Integer?)
* getOffersData(offerId: Integer?)
* apiRequest(params: String) - native admitad api request