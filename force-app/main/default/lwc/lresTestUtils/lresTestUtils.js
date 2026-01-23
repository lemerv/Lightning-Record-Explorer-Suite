export const flushPromises = () =>
  // eslint-disable-next-line @lwc/lwc/no-async-operation
  new Promise((resolve) => setTimeout(resolve, 0));

export async function settleComponent(iterations = 3) {
  for (let i = 0; i < iterations; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await flushPromises();
  }
}

export function createDataTransfer() {
  const store = new Map();
  return {
    effectAllowed: undefined,
    dropEffect: undefined,
    setData: jest.fn((type, value) => {
      store.set(type, value);
    }),
    getData: jest.fn((type) => store.get(type)),
    clear: () => store.clear()
  };
}

export function buildWireRecord({ id, fields }) {
  return {
    id,
    fields
  };
}

export function buildWireRecordsFromRaw(records = [], objectApiName) {
  return records.map((record) => {
    const { id, fields = {} } = record;
    const normalizedFields = Object.entries(fields).reduce(
      (acc, [fieldName, value]) => {
        const payload =
          value && typeof value === "object" && "value" in value
            ? value
            : { value, displayValue: value };
        const qualifiedName = objectApiName
          ? `${objectApiName}.${fieldName}`
          : fieldName;
        acc[qualifiedName] = payload;
        acc[fieldName] = payload;
        return acc;
      },
      {}
    );
    return buildWireRecord({ id, fields: normalizedFields });
  });
}
