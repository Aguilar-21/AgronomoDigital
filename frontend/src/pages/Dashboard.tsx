import {
  ArrowUpRight,
  DollarSign,
  Sprout,
  TrendingUp,
  Wallet,
} from "lucide-react";

import StatCard from "../components/StatCard";

const priceData = [
  { day: "Lun", price: 21.5 },
  { day: "Mar", price: 21.8 },
  { day: "Mié", price: 21.6 },
  { day: "Jue", price: 22.1 },
  { day: "Vie", price: 22.5 },
  { day: "Sáb", price: 22.8 },
  { day: "Dom", price: 23.1 },
];

function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">

      {/* Encabezado */}
      <section>
        <p className="text-sm font-medium text-[#1B5E20]">
          Resumen agrícola
        </p>

        <div className="mt-1 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 md:text-3xl">
              Tu actividad agrícola
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Consulta tus costos, precios de mercado y oportunidades de venta.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-slate-100">
            <Sprout size={18} className="text-[#1B5E20]" />

            <span className="text-sm font-medium text-slate-600">
              Maíz Blanco
            </span>
          </div>
        </div>
      </section>

      {/* Tarjetas principales */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <StatCard
          title="Ingresos estimados"
          value="$2,450.00"
          description="Proyección de venta actual"
          icon={DollarSign}
          iconColor="#1B5E20"
          trend="+8.5%"
        />

        <StatCard
          title="Costos acumulados"
          value="$1,280.00"
          description="Inversión del ciclo actual"
          icon={Wallet}
          iconColor="#D97706"
          trend="+4.2%"
        />

        <StatCard
          title="Ganancia estimada"
          value="$1,170.00"
          description="Después de costos"
          icon={TrendingUp}
          iconColor="#0284C7"
          trend="+12.4%"
        />

        <StatCard
          title="Precio de mercado"
          value="$22.50"
          description="Por quintal · Maíz Blanco"
          icon={Sprout}
          iconColor="#1B5E20"
          trend="+3.25%"
        />

      </section>

      {/* Gráfico + precio actual */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* Gráfico */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2">

          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

            <div>
              <h2 className="text-lg font-bold text-slate-800">
                Tendencia del precio
              </h2>

              <p className="text-sm text-slate-400">
                Maíz Blanco · Últimos 7 días
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
              <TrendingUp size={16} className="text-[#1B5E20]" />

              <span className="text-sm font-semibold text-[#1B5E20]">
                +7.4%
              </span>
            </div>

          </div>

          {/* Gráfico visual */}
          <div className="mt-6 h-64">

            <div className="flex h-full items-end gap-2 sm:gap-4">

              {priceData.map((item) => {
                const height = `${((item.price - 20) / 4) * 100}%`;

                return (
                  <div
                    key={item.day}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                  >

                    <span className="text-xs font-medium text-slate-500">
                      ${item.price.toFixed(2)}
                    </span>

                    <div className="flex h-full w-full items-end">
                      <div
                        className="w-full rounded-t-lg bg-[#1B5E20] transition hover:bg-[#D97706]"
                        style={{ height }}
                      />
                    </div>

                    <span className="text-xs text-slate-400">
                      {item.day}
                    </span>

                  </div>
                );
              })}

            </div>
          </div>
        </div>

        {/* Precio actual */}
        <div className="rounded-2xl bg-[#1B5E20] p-6 text-white shadow-sm">

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/70">
                Precio actual
              </p>

              <h2 className="mt-2 text-4xl font-bold">
                $22.50
              </h2>

              <p className="mt-1 text-sm text-white/70">
                por quintal
              </p>
            </div>

            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
              <Sprout size={25} />
            </div>
          </div>

          <div className="mt-8 rounded-xl bg-white/10 p-4">

            <div className="flex items-center gap-2">
              <ArrowUpRight size={18} />

              <span className="text-sm font-semibold">
                Precio favorable
              </span>
            </div>

            <p className="mt-2 text-xs leading-5 text-white/70">
              El precio actual está por encima del promedio registrado durante
              los últimos días.
            </p>

          </div>

          <button className="mt-5 w-full rounded-xl bg-white py-3 text-sm font-bold text-[#1B5E20] transition hover:bg-slate-100">
            Ver mercado
          </button>

        </div>

      </section>

      {/* Recomendación */}
      <section className="rounded-2xl border border-orange-100 bg-orange-50 p-5">

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D97706] text-white">
            <TrendingUp size={22} />
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#D97706]">
              Recomendación AgrónomoDigital
            </p>

            <h3 className="mt-1 text-lg font-bold text-slate-800">
              El mercado muestra una tendencia favorable.
            </h3>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              El precio del Maíz Blanco presenta un crecimiento durante los
              últimos días. Antes de vender, compara las opciones de
              intermediario, mercado mayorista y otros canales disponibles.
            </p>

          </div>

        </div>

      </section>

    </div>
  );
}

export default Dashboard;