import { getTranslations } from "next-intl/server";
import { createProperty } from "../actions";
import { CURRENCIES, PROPERTY_TYPES } from "@/lib/types";

export default async function NewPropertyPage() {
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold">{t("properties.add")}</h1>
      <form action={createProperty} className="card space-y-4">
        <div>
          <label className="label" htmlFor="name">{t("properties.name")}</label>
          <input className="input" id="name" name="name" required placeholder="Koti / Mökki" />
        </div>
        <div>
          <label className="label" htmlFor="address">{t("properties.address")}</label>
          <input className="input" id="address" name="address" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="type">{t("properties.type")}</label>
            <select className="input" id="type" name="type" defaultValue="house">
              {PROPERTY_TYPES.map((ty) => (
                <option key={ty} value={ty}>{t(`types.${ty}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="currency">{t("properties.currency")}</label>
            <select className="input" id="currency" name="currency" defaultValue="EUR">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="year_built">{t("properties.yearBuilt")}</label>
            <input className="input" id="year_built" name="year_built" type="number" min={1600} max={2100} />
          </div>
          <div>
            <label className="label" htmlFor="size_m2">{t("properties.size")}</label>
            <input className="input" id="size_m2" name="size_m2" type="number" step="0.1" min={0} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="heating_type">{t("properties.heating")}</label>
          <input className="input" id="heating_type" name="heating_type" list="heating-options" />
          <datalist id="heating-options">
            <option value="District heating" />
            <option value="Ground-source heat pump" />
            <option value="Air-to-water heat pump" />
            <option value="Direct electric" />
            <option value="Oil" />
            <option value="Wood / pellet" />
          </datalist>
        </div>
        <button className="btn w-full">{t("properties.create")}</button>
      </form>
    </div>
  );
}
