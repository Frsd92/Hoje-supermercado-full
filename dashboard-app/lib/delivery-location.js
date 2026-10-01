function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function splitCityAndState(value) {
  const cityAndState = clean(value);
  const match = /^(.*?)\s*[-/]\s*([A-Za-z]{2})$/.exec(cityAndState);
  if (!match) return { city: cityAndState, state: '' };
  return { city: clean(match[1]), state: match[2].toUpperCase() };
}

function parseCityField(value) {
  const parts = clean(value).split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { neighborhood: '', municipality: '', state: '' };

  const place = splitCityAndState(parts.at(-1));
  return {
    neighborhood: parts.length > 1 ? parts.slice(0, -1).join(', ') : '',
    municipality: place.city,
    state: place.state,
  };
}

export function getDeliveryLocation(order) {
  const addressDetails = order?.addressDetails;
  if (addressDetails && typeof addressDetails === 'object') {
    const parsed = parseCityField(addressDetails.city || addressDetails.municipality);
    const state = clean(addressDetails.state) || parsed.state;
    const municipality = clean(addressDetails.municipality) || parsed.municipality;
    const neighborhood = clean(addressDetails.neighborhood) || parsed.neighborhood;
    if (state || municipality || neighborhood) {
      return {
        state,
        municipality,
        neighborhood,
      };
    }
  }

  const address = order?.address;
  if (address && typeof address === 'object') {
    const parsed = parseCityField(address.city || address.municipality);
    const state = clean(address.state) || parsed.state;
    const municipality = clean(address.municipality) || parsed.municipality;
    const neighborhood = clean(address.neighborhood) || parsed.neighborhood;
    if (state || municipality || neighborhood) {
      return { state, municipality, neighborhood };
    }
  }

  const legacyAddress = clean(address);
  const addressParts = legacyAddress.split('|').map((part) => part.trim()).filter(Boolean);
  if (addressParts.length >= 3) return getDeliveryLocation({ addressDetails: { city: addressParts.at(-1) } });

  const brazilianAddress = /,\s*([^,]+),\s*([^,]+?)\s*[-/]\s*([A-Za-z]{2})$/.exec(legacyAddress);
  if (brazilianAddress) {
    return {
      state: brazilianAddress[3].toUpperCase(),
      municipality: clean(brazilianAddress[2]),
      neighborhood: clean(brazilianAddress[1]),
    };
  }

  return { state: '', municipality: '', neighborhood: '' };
}

export function normalizeDeliveryLocation(addressDetails) {
  const parsed = parseCityField(addressDetails?.city || addressDetails?.municipality);
  return {
    title: clean(addressDetails?.title),
    street: clean(addressDetails?.street),
    neighborhood: clean(addressDetails?.neighborhood) || parsed.neighborhood,
    municipality: clean(addressDetails?.municipality) || parsed.municipality,
    state: clean(addressDetails?.state).toUpperCase() || parsed.state,
  };
}
