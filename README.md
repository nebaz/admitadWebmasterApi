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
* getProfile(): Object
* getBalance(currency: String): Object
* getTrafficChannels(): Array< Object >
* getOfferLinkByOfferId(offerId: Integer, channelId: Integer): String
* getStatisticsOffersByOfferId(dateFrom: timestamp, dateTo: timestamp, offerId: Integer?, channelId: Integer?, subId: String?): Array< Object >
* getLeadsByOfferId(dateFrom: timestamp, dateTo: timestamp, offerId: Integer?, channelId: Integer?): Array< Object >
* getCrByOfferId(dateFrom: timestamp, dateTo: timestamp, offerId: Integer, channelId: Integer?): Array< Object >
* apiRequest(params: String) - native admitad api request