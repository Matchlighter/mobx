import {
    ObservableObjectAdministration,
    deepEnhancer,
    die,
    Annotation,
    MakeResult,
    assert20223DecoratorType,
    ObservableValue,
    asObservableObject,
    $mobx
} from "../internal"

export function createObservableAnnotation(name: string, options?: object): Annotation {
    return {
        annotationType_: name,
        options_: options,
        make_,
        extend_,
        decorate_20223_
    }
}

function make_(
    this: Annotation,
    adm: ObservableObjectAdministration,
    key: PropertyKey,
    descriptor: PropertyDescriptor
): MakeResult {
    return this.extend_(adm, key, descriptor, false) === null ? MakeResult.Cancel : MakeResult.Break
}

function extend_(
    this: Annotation,
    adm: ObservableObjectAdministration,
    key: PropertyKey,
    descriptor: PropertyDescriptor,
    proxyTrap: boolean
): boolean | null {
    assertObservableDescriptor(adm, this, key, descriptor)
    return adm.defineObservableProperty_(
        key,
        descriptor.value,
        this.options_?.enhancer ?? deepEnhancer,
        proxyTrap
    )
}

function decorate_20223_(this: Annotation, desc, context: ClassAccessorDecoratorContext) {
    assert20223DecoratorType(context, ["accessor"])
    const ann = this
    const { name: key, access, addInitializer } = context

    addInitializer(function () {
        const adm: ObservableObjectAdministration = asObservableObject(this)[$mobx]
        const observable = new ObservableValue(
            access.get(this),
            ann.options_?.enhancer,
            __DEV__ ? `${adm.name_}.${key.toString()}` : "ObservableObject.key",
            false
        )
        adm.values_.set(key, observable)
    })

    return {
        get() {
            return this[$mobx].getObservablePropValue_(key)
        },
        set(value) {
            return this[$mobx].setObservablePropValue_(key, value)
        }
        // init(value) {
        //     const adm: ObservableObjectAdministration = asObservableObject(this)[$mobx]
        //     const observable = new ObservableValue(
        //         value,
        //         ann.options_?.enhancer,
        //         __DEV__ ? `${adm.name_}.${key.toString()}` : "ObservableObject.key",
        //         false
        //     )
        //     adm.values_.set(key, observable)
        // }
    }
}

function assertObservableDescriptor(
    adm: ObservableObjectAdministration,
    { annotationType_ }: Annotation,
    key: PropertyKey,
    descriptor: PropertyDescriptor
) {
    if (__DEV__ && !("value" in descriptor)) {
        die(
            `Cannot apply '${annotationType_}' to '${adm.name_}.${key.toString()}':` +
                `\n'${annotationType_}' cannot be used on getter/setter properties`
        )
    }
}
