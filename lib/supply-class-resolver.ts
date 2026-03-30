import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

const normalizeKey = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const asNonEmptyString = (value: unknown): string => {
  const normalized = String(value ?? "").trim();
  return normalized;
};

export const resolveSupplyItemLabel = (supply: any): string => {
  const candidates = [
    supply?.item,
    supply?.itemName,
    supply?.name,
    supply?.description,
    supply?.productName,
    supply?.itemDescription,
  ];

  for (const candidate of candidates) {
    const normalized = asNonEmptyString(candidate);
    if (normalized) return normalized;
  }

  return "N/A";
};

export const resolveSupplyQuantityValue = (supply: any): number => {
  const candidates = [
    supply?.quantity,
    supply?.qty,
    supply?.requestedQty,
    supply?.approvedQty,
    supply?.releasedQty,
    supply?.releaseQty,
    supply?.issuedQty,
    supply?.count,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
};

const resolveInlineSupplyClass = (supply: any): string => {
  const candidates = [
    supply?.category,
    supply?.supplyClass,
    supply?.supply_class,
    supply?.classification,
    supply?.class,
    supply?.itemCategory,
    supply?.itemClass,
    supply?.type,
  ];

  for (const candidate of candidates) {
    const normalized = asNonEmptyString(candidate);
    if (normalized && normalized.toLowerCase() !== "uncategorized") {
      return normalized;
    }
  }

  return "";
};

let itemClassLookupPromise: Promise<Map<string, string>> | null = null;

const buildItemClassLookup = async (): Promise<Map<string, string>> => {
  const lookup = new Map<string, string>();
  const snap = await getDocs(collection(db, "items"));

  snap.forEach((itemDoc) => {
    const data = itemDoc.data() as any;
    const resolvedClass =
      asNonEmptyString(data?.supplyClass) ||
      asNonEmptyString(data?.category) ||
      asNonEmptyString(data?.classification) ||
      asNonEmptyString(data?.class) ||
      asNonEmptyString(data?.itemClass) ||
      asNonEmptyString(data?.type);

    if (!resolvedClass) return;

    const itemKeys = [
      data?.item,
      data?.itemName,
      data?.name,
      data?.description,
      data?.productName,
      data?.itemDescription,
      data?.code,
      itemDoc.id,
    ];

    itemKeys.forEach((keyCandidate) => {
      const key = normalizeKey(keyCandidate);
      if (!key) return;
      if (!lookup.has(key)) {
        lookup.set(key, resolvedClass);
      }
    });
  });

  return lookup;
};

export const getItemClassLookup = async (): Promise<Map<string, string>> => {
  if (!itemClassLookupPromise) {
    itemClassLookupPromise = buildItemClassLookup();
  }
  return itemClassLookupPromise;
};

export const resolveSupplyClassLabel = (supply: any, lookup?: Map<string, string>): string => {
  const inlineClass = resolveInlineSupplyClass(supply);
  if (inlineClass) return inlineClass;

  const resolvedItem = resolveSupplyItemLabel(supply);
  const fromLookup = lookup?.get(normalizeKey(resolvedItem));
  if (fromLookup) return fromLookup;

  return "Uncategorized";
};
